import { NextRequest } from 'next/server'
import { getDriveAccessToken } from '@/lib/drive-auth'
import { google } from 'googleapis'

export const runtime = 'nodejs'

const MINIMAX_API_KEY = process.env.MINIMAX_API_KEY
const MINIMAX_MODEL = 'MiniMax-M2.7'

const NOTE_TOOLS = [
  {
    name: 'search_notes',
    description: '노트 제목이나 내용에서 키워드를 검색합니다. 특정 주제나 키워드가 포함된 노트를 찾을 때 사용하세요.',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: '검색할 키워드' },
      },
      required: ['query'],
    },
  },
  {
    name: 'get_note_content',
    description: '특정 노트의 전체 내용을 가져옵니다. search_notes로 찾은 fileId를 사용하세요.',
    input_schema: {
      type: 'object',
      properties: {
        fileId: { type: 'string', description: '노트 파일 ID' },
        fileName: { type: 'string', description: '노트 파일 이름 (표시용)' },
      },
      required: ['fileId'],
    },
  },
  {
    name: 'list_notes',
    description: '볼트에 있는 모든 노트 파일 목록을 가져옵니다. 어떤 노트들이 있는지 파악할 때 사용하세요.',
    input_schema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
]

type DriveClient = ReturnType<typeof google.drive>

async function executeTool(
  name: string,
  input: Record<string, string>,
  drive: DriveClient,
  vaultFolderId: string
): Promise<string> {
  if (name === 'list_notes') {
    const files: { id: string; name: string }[] = []
    let pageToken: string | undefined
    do {
      const res = await drive.files.list({
        q: `'${vaultFolderId}' in parents and trashed = false and name contains '.md'`,
        pageSize: 100,
        fields: 'nextPageToken, files(id,name,modifiedTime)',
        pageToken,
      })
      files.push(...((res.data.files || []).filter((f) => f.name?.endsWith('.md') && f.id) as { id: string; name: string }[]))
      pageToken = res.data.nextPageToken ?? undefined
    } while (pageToken)
    return JSON.stringify(files.map((f) => ({ id: f.id, name: f.name?.replace(/\.md$/, '') })))
  }

  if (name === 'search_notes') {
    const ql = input.query.toLowerCase()
    const files: { id: string; name: string }[] = []
    let pageToken: string | undefined
    do {
      const res = await drive.files.list({
        q: `'${vaultFolderId}' in parents and trashed = false and name contains '.md'`,
        pageSize: 100,
        fields: 'nextPageToken, files(id,name)',
        pageToken,
      })
      files.push(...((res.data.files || []).filter((f) => f.name?.endsWith('.md') && f.id) as { id: string; name: string }[]))
      pageToken = res.data.nextPageToken ?? undefined
    } while (pageToken)

    const results: { fileId: string; fileName: string; snippet: string }[] = []
    await Promise.all(
      files.map(async (file) => {
        const nameMatch = file.name.toLowerCase().includes(ql)
        let snippet = ''
        let contentMatch = false
        try {
          const fileRes = await drive.files.get({ fileId: file.id, alt: 'media' }, { responseType: 'text' })
          const text = fileRes.data as string
          if (text.toLowerCase().includes(ql)) {
            contentMatch = true
            const idx = text.toLowerCase().indexOf(ql)
            const start = Math.max(0, idx - 60)
            const end = Math.min(text.length, idx + ql.length + 60)
            snippet = text.slice(start, end)
          }
        } catch {}
        if (nameMatch || contentMatch) {
          results.push({ fileId: file.id, fileName: file.name.replace(/\.md$/, ''), snippet })
        }
      })
    )
    return JSON.stringify(results.slice(0, 10))
  }

  if (name === 'get_note_content') {
    const fileRes = await drive.files.get({ fileId: input.fileId, alt: 'media' }, { responseType: 'text' })
    return fileRes.data as string
  }

  return 'Unknown tool'
}

const TOOL_STATUS: Record<string, (input: Record<string, string>) => string> = {
  search_notes: (i) => `🔍 "${i.query}" 검색 중...`,
  get_note_content: (i) => `📄 "${i.fileName || i.fileId}" 노트 읽는 중...`,
  list_notes: () => '📋 노트 목록 불러오는 중...',
}

export async function POST(req: NextRequest) {
  const auth = await getDriveAccessToken(req, ['drive.read'])
  if (!auth.ok) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })

  if (!MINIMAX_API_KEY) {
    return new Response(JSON.stringify({ error: 'MINIMAX_API_KEY not configured' }), { status: 500 })
  }

  try {
    const { messages, systemPrompt, vaultFolderId } = await req.json()

    const oauth2Client = new google.auth.OAuth2()
    oauth2Client.setCredentials({ access_token: auth.accessToken })
    const drive = google.drive({ version: 'v3', auth: oauth2Client })

    // Extract system message if first message has role 'system'
    let system: string | undefined = systemPrompt
    let chatMessages = messages
    if (!system && messages[0]?.role === 'system') {
      system = messages[0].content
      chatMessages = messages.slice(1)
    }

    const encoder = new TextEncoder()

    const stream = new ReadableStream({
      async start(controller) {
        const enqueue = (data: Record<string, unknown>) => {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))
        }

        let currentMessages = [...chatMessages]

        for (let iter = 0; iter < 6; iter++) {
          const body: Record<string, unknown> = {
            model: MINIMAX_MODEL,
            max_tokens: 4096,
            stream: false,
            messages: currentMessages,
          }
          if (system) body.system = system
          if (vaultFolderId) body.tools = NOTE_TOOLS

          const response = await fetch('https://api.minimax.io/anthropic/v1/messages', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-api-key': MINIMAX_API_KEY,
              'anthropic-version': '2023-06-01',
            },
            body: JSON.stringify(body),
          })

          if (!response.ok) {
            const err = await response.text()
            enqueue({ type: 'error', text: err })
            break
          }

          const result = await response.json()
          const contentBlocks: Array<{ type: string; text?: string; id?: string; name?: string; input?: Record<string, string> }> =
            result.content || []
          const stopReason: string = result.stop_reason || 'end_turn'

          if (stopReason === 'tool_use') {
            currentMessages.push({ role: 'assistant', content: contentBlocks })
            const toolResults = []

            for (const block of contentBlocks) {
              if (block.type !== 'tool_use' || !block.id || !block.name) continue
              const input = block.input || {}
              enqueue({ type: 'tool_status', text: TOOL_STATUS[block.name]?.(input) ?? `⚙️ ${block.name} 실행 중...` })
              let toolResultContent = ''
              try {
                toolResultContent = await executeTool(block.name, input, drive, vaultFolderId || '')
              } catch (e: unknown) {
                toolResultContent = `Error: ${e instanceof Error ? e.message : String(e)}`
              }
              toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: toolResultContent })
            }

            currentMessages.push({ role: 'user', content: toolResults })
            continue
          }

          // Stream text response
          const textBlock = contentBlocks.find((b) => b.type === 'text')
          const fullText = textBlock?.text || ''
          const chunkSize = 15
          for (let j = 0; j < fullText.length; j += chunkSize) {
            enqueue({ type: 'content_block_delta', delta: { text: fullText.slice(j, j + chunkSize) } })
          }
          break
        }

        controller.close()
      },
    })

    return new Response(stream, {
      headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' },
    })
  } catch {
    return new Response(JSON.stringify({ error: 'Failed to call AI' }), { status: 500 })
  }
}
