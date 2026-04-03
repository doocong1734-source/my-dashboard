import { NextRequest } from 'next/server'
import { getDriveAccessToken } from '@/lib/drive-auth'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  // Auth check
  const auth = await getDriveAccessToken(req, ['drive.read'])
  if (!auth.ok) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })

  if (!process.env.MINIMAX_API_KEY) {
    return new Response(JSON.stringify({ error: 'MINIMAX_API_KEY not configured' }), { status: 500 })
  }

  try {
    const { messages, systemPrompt } = await req.json()

    const body: Record<string, unknown> = {
      model: 'MiniMax-M2.7',
      max_tokens: 4096,
      stream: true,
      messages,
    }
    if (systemPrompt) {
      body.system = systemPrompt
    }

    const response = await fetch('https://api.minimax.io/anthropic/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.MINIMAX_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(body),
    })

    if (!response.ok || !response.body) {
      const err = await response.text()
      return new Response(JSON.stringify({ error: err }), { status: response.status })
    }

    return new Response(response.body, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    })
  } catch {
    return new Response(JSON.stringify({ error: 'Failed to call AI' }), { status: 500 })
  }
}
