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
  {
    name: 'list_vault_structure',
    description: '볼트의 폴더 구조와 파일을 트리 형태로 보여줍니다. 어떤 폴더들이 있는지 파악하거나 특정 폴더 내 파일을 확인할 때 사용하세요.',
    input_schema: {
      type: 'object',
      properties: {
        folderId: { type: 'string', description: '조회할 폴더 ID (없으면 볼트 루트)' },
      },
      required: [],
    },
  },
  {
    name: 'create_folder',
    description: '볼트 내에 새 폴더를 생성합니다.',
    input_schema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: '폴더 이름' },
        parentId: { type: 'string', description: '부모 폴더 ID (없으면 볼트 루트)' },
      },
      required: ['name'],
    },
  },
  {
    name: 'create_or_update_note',
    description: '노트 파일을 생성하거나 내용을 업데이트합니다. fileId가 있으면 업데이트, 없으면 새로 생성합니다.',
    input_schema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: '파일 이름 (.md 확장자 없이)' },
        content: { type: 'string', description: '마크다운 내용' },
        folderId: { type: 'string', description: '저장할 폴더 ID (없으면 볼트 루트)' },
        fileId: { type: 'string', description: '업데이트할 파일 ID (새 파일이면 비워둘 것)' },
      },
      required: ['title', 'content'],
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

  if (name === 'list_vault_structure') {
    const rootId = input.folderId || vaultFolderId
    type Entry = { id: string; name: string; type: 'folder' | 'file'; children?: Entry[] }

    async function fetchFolder(folderId: string): Promise<Entry[]> {
      const entries: Entry[] = []
      let pageToken: string | undefined
      do {
        const res = await drive.files.list({
          q: `'${folderId}' in parents and trashed = false`,
          pageSize: 100,
          fields: 'nextPageToken, files(id,name,mimeType)',
          pageToken,
          orderBy: 'name',
        })
        for (const f of res.data.files || []) {
          if (!f.id || !f.name) continue
          if (f.mimeType === 'application/vnd.google-apps.folder') {
            const children = await fetchFolder(f.id)
            entries.push({ id: f.id, name: f.name, type: 'folder', children })
          } else {
            entries.push({ id: f.id, name: f.name.replace(/\.md$/, ''), type: 'file' })
          }
        }
        pageToken = res.data.nextPageToken ?? undefined
      } while (pageToken)
      return entries
    }

    const tree = await fetchFolder(rootId)
    return JSON.stringify(tree)
  }

  if (name === 'create_folder') {
    const parentId = input.parentId || vaultFolderId
    const res = await drive.files.create({
      requestBody: {
        name: input.name,
        mimeType: 'application/vnd.google-apps.folder',
        parents: [parentId],
      },
      fields: 'id,name',
    })
    return JSON.stringify({ id: res.data.id, name: res.data.name })
  }

  if (name === 'create_or_update_note') {
    const { Readable } = await import('stream')
    const fileName = input.title.endsWith('.md') ? input.title : `${input.title}.md`
    const content = input.content || ''

    if (input.fileId) {
      await drive.files.update({
        fileId: input.fileId,
        media: { mimeType: 'text/markdown', body: Readable.from([Buffer.from(content, 'utf-8')]) },
      })
      return JSON.stringify({ updated: true, fileId: input.fileId })
    }

    const folderId = input.folderId || vaultFolderId
    const res = await drive.files.create({
      requestBody: { name: fileName, mimeType: 'text/markdown', parents: [folderId] },
      media: { mimeType: 'text/markdown', body: Readable.from([Buffer.from(content, 'utf-8')]) },
      fields: 'id,name',
    })
    return JSON.stringify({ created: true, fileId: res.data.id, name: res.data.name })
  }

  return 'Unknown tool'
}

const TOOL_STATUS: Record<string, (input: Record<string, string>) => string> = {
  search_notes: (i) => `🔍 "${i.query}" 검색 중...`,
  get_note_content: (i) => `📄 "${i.fileName || i.fileId}" 노트 읽는 중...`,
  list_notes: () => '📋 노트 목록 불러오는 중...',
  list_vault_structure: () => '📁 폴더 구조 불러오는 중...',
  create_folder: (i) => `📁 "${i.name}" 폴더 생성 중...`,
  create_or_update_note: (i) => `✍️ "${i.title}" 노트 저장 중...`,
}

export async function POST(req: NextRequest) {
  const auth = await getDriveAccessToken(req, ['drive.read', 'drive.write'])
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
