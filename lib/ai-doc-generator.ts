type GenerateSkillDraftParams = {
  skillName: string
  sections: string[]
  payload: Record<string, string>
  prompt: string
  ai?: {
    provider?: 'openai' | 'anthropic' | 'gemini' | 'openrouter'
    model?: string
    temperature?: number
  }
}

type GenerateSkillDraftResult = {
  content: string
  mode: 'ai' | 'fallback'
  warning?: string
  provider: 'openai' | 'anthropic' | 'gemini' | 'openrouter'
  model: string
}

type OpenAIChatResponse = {
  choices?: Array<{
    message?: {
      content?: string
    }
  }>
}

type AnthropicResponse = {
  content?: Array<{ type?: string; text?: string }>
}

type GeminiResponse = {
  candidates?: Array<{
    content?: {
      parts?: Array<{ text?: string }>
    }
  }>
}

function clampTemperature(value: number | undefined) {
  if (typeof value !== 'number' || Number.isNaN(value)) return 0.4
  if (value < 0) return 0
  if (value > 1) return 1
  return value
}

function getDefaultModel(provider: 'openai' | 'anthropic' | 'gemini' | 'openrouter') {
  if (provider === 'anthropic') return 'claude-3-5-haiku-latest'
  if (provider === 'gemini') return 'gemini-1.5-flash'
  if (provider === 'openrouter') return 'openai/gpt-4o-mini'
  return 'gpt-4o-mini'
}

function buildAiUserPrompt(skillName: string, sections: string[], payload: Record<string, string>, prompt: string) {
  return [
    `문서 유형: ${skillName}`,
    `요청 섹션: ${sections.join(', ')}`,
    '아래 입력값과 생성 프롬프트를 바탕으로 실제 내용이 채워진 문서를 작성해줘.',
    '',
    '입력값(JSON):',
    JSON.stringify(payload, null, 2),
    '',
    '생성 프롬프트:',
    prompt,
  ].join('\n')
}

function buildFallbackDraft(skillName: string, sections: string[], payload: Record<string, string>) {
  const lines: string[] = []
  lines.push(`아래는 **${skillName}** 자동 초안입니다.`)
  lines.push('')

  const payloadLines = Object.entries(payload)
    .map(([key, value]) => `- ${key}: ${value || '-'}`)
    .join('\n')

  for (const section of sections) {
    lines.push(`### ${section}`)
    lines.push(payloadLines || '-')
    lines.push('')
  }

  return lines.join('\n').trim()
}

export async function generateSkillDraft({
  skillName,
  sections,
  payload,
  prompt,
  ai,
}: GenerateSkillDraftParams): Promise<GenerateSkillDraftResult> {
  const provider = ai?.provider || (process.env.AI_PROVIDER as 'openai' | 'anthropic' | 'gemini' | 'openrouter') || 'openai'
  const model = ai?.model?.trim() || process.env.AI_MODEL || getDefaultModel(provider)
  const temperature = clampTemperature(ai?.temperature)
  const userPrompt = buildAiUserPrompt(skillName, sections, payload, prompt)

  const fallbackBase = {
    content: buildFallbackDraft(skillName, sections, payload),
    mode: 'fallback' as const,
    provider,
    model,
  }

  if (provider === 'openai' && !process.env.OPENAI_API_KEY) {
    return {
      ...fallbackBase,
      warning: 'OPENAI_API_KEY is not configured; generated fallback draft instead.',
    }
  }
  if (provider === 'anthropic' && !process.env.ANTHROPIC_API_KEY) {
    return {
      ...fallbackBase,
      warning: 'ANTHROPIC_API_KEY is not configured; generated fallback draft instead.',
    }
  }
  if (provider === 'gemini' && !process.env.GEMINI_API_KEY) {
    return {
      ...fallbackBase,
      warning: 'GEMINI_API_KEY is not configured; generated fallback draft instead.',
    }
  }
  if (provider === 'openrouter' && !process.env.OPENROUTER_API_KEY) {
    return {
      ...fallbackBase,
      warning: 'OPENROUTER_API_KEY is not configured; generated fallback draft instead.',
    }
  }

  try {
    let content = ''
    let ok = false

    if (provider === 'openai') {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          temperature,
          messages: [
            {
              role: 'system',
              content:
                'You are a Korean business writing assistant. Generate concise, practical markdown content. Output only markdown body, no code fences.',
            },
            {
              role: 'user',
              content: userPrompt,
            },
          ],
        }),
      })

      const data = (await response.json()) as OpenAIChatResponse
      content = data.choices?.[0]?.message?.content?.trim() || ''
      ok = response.ok
    } else if (provider === 'anthropic') {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': process.env.ANTHROPIC_API_KEY || '',
          'anthropic-version': '2023-06-01',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          max_tokens: 1200,
          temperature,
          system:
            'You are a Korean business writing assistant. Generate concise, practical markdown content. Output only markdown body, no code fences.',
          messages: [{ role: 'user', content: userPrompt }],
        }),
      })

      const data = (await response.json()) as AnthropicResponse
      content = data.content?.find(item => item.type === 'text')?.text?.trim() || ''
      ok = response.ok
    } else if (provider === 'gemini') {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${process.env.GEMINI_API_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: userPrompt }] }],
            generationConfig: { temperature },
          }),
        }
      )

      const data = (await response.json()) as GeminiResponse
      content = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || ''
      ok = response.ok
    } else {
      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          temperature,
          messages: [
            {
              role: 'system',
              content:
                'You are a Korean business writing assistant. Generate concise, practical markdown content. Output only markdown body, no code fences.',
            },
            {
              role: 'user',
              content: userPrompt,
            },
          ],
        }),
      })

      const data = (await response.json()) as OpenAIChatResponse
      content = data.choices?.[0]?.message?.content?.trim() || ''
      ok = response.ok
    }

    if (!ok || !content) {
      return {
        ...fallbackBase,
        warning: `AI generation failed on ${provider}/${model}; generated fallback draft instead.`,
      }
    }

    return {
      content,
      mode: 'ai',
      provider,
      model,
    }
  } catch {
    return {
      ...fallbackBase,
      warning: `AI request failed on ${provider}/${model}; generated fallback draft instead.`,
    }
  }
}
