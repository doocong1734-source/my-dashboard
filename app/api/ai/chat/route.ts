import { NextRequest } from 'next/server'
import { getDriveAccessToken } from '@/lib/drive-auth'

export const runtime = 'nodejs'

const OLLAMA_BASE = process.env.OLLAMA_BASE_URL
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
  // Google AI Studio - OpenAI-compatible endpoint
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

  return new Response(response.body, {
    headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' },
  })
}
