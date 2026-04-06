import { NextRequest } from 'next/server'
import { getDriveAccessToken } from '@/lib/drive-auth'

export const runtime = 'nodejs'

// Vercel 배포 환경에서는 Ollama 사용 안 함 (로컬 전용)
const OLLAMA_BASE = process.env.VERCEL ? undefined : process.env.OLLAMA_BASE_URL
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'gemma4:e4b'
const GOOGLE_AI_KEY = process.env.GOOGLE_AI_KEY
const GOOGLE_AI_MODEL = process.env.GOOGLE_AI_MODEL || 'gemini-2.0-flash' // Google AI Studio

export async function POST(req: NextRequest) {
  const auth = await getDriveAccessToken(req, ['drive.read'])
  if (!auth.ok) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })

  try {
    const { messages, systemPrompt } = await req.json()

    // 로컬: Ollama 우선 / 프로덕션: Google AI
    if (OLLAMA_BASE) {
      return callOllama(messages, systemPrompt)
    } else if (GOOGLE_AI_KEY) {
      return callGoogleAI(messages, systemPrompt)
    } else {
      return new Response(JSON.stringify({ error: 'No AI backend configured' }), { status: 500 })
    }
  } catch {
    return new Response(JSON.stringify({ error: 'Failed to call AI' }), { status: 500 })
  }
}

async function callOllama(messages: unknown[], systemPrompt?: string) {
  const ollamaMessages = systemPrompt
    ? [{ role: 'system', content: systemPrompt }, ...messages]
    : messages

  const response = await fetch(`${OLLAMA_BASE}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: OLLAMA_MODEL, messages: ollamaMessages, stream: true }),
  })

  if (!response.ok || !response.body) {
    const err = await response.text()
    return new Response(JSON.stringify({ error: err }), { status: response.status })
  }

  return new Response(response.body, {
    headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' },
  })
}

async function callGoogleAI(messages: unknown[], systemPrompt?: string) {
  const allMessages = systemPrompt
    ? [{ role: 'system', content: systemPrompt }, ...messages]
    : messages

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/openai/chat/completions`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${GOOGLE_AI_KEY}`,
      },
      body: JSON.stringify({ model: GOOGLE_AI_MODEL, messages: allMessages, stream: true }),
    }
  )

  if (!response.ok || !response.body) {
    const err = await response.text()
    return new Response(JSON.stringify({ error: err }), { status: response.status })
  }

  // OpenAI 포맷 → Anthropic 포맷 변환 (프론트엔드 호환)
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        const chunk = decoder.decode(value, { stream: true })
        for (const line of chunk.split('\n')) {
          if (!line.startsWith('data: ')) continue
          const data = line.slice(6).trim()
          if (data === '[DONE]') continue
          try {
            const parsed = JSON.parse(data)
            const text = parsed.choices?.[0]?.delta?.content
            if (text) {
              // Anthropic 포맷으로 변환
              const anthropicChunk = JSON.stringify({
                type: 'content_block_delta',
                delta: { text },
              })
              controller.enqueue(encoder.encode(`data: ${anthropicChunk}\n\n`))
            }
          } catch {}
        }
      }
      controller.close()
    },
  })

  return new Response(stream, {
    headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' },
  })
}
