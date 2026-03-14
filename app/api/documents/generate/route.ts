import { getServerSession } from 'next-auth'
import { NextRequest, NextResponse } from 'next/server'
import { authOptions } from '@/lib/auth'
import { supabase } from '@/lib/supabase'
import { buildGeneratedMarkdown, buildPrompt } from '@/lib/skill-templates'
import { findSkillById } from '@/lib/skills-store'

type GenerateBody = {
  skillId: string
  title?: string
  payload: Record<string, string>
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function validateGenerateBody(value: unknown):
  | { ok: true; body: GenerateBody }
  | { ok: false; status: number; error: string } {
  if (!isPlainObject(value)) {
    return { ok: false, status: 400, error: 'Invalid request body' }
  }

  if (typeof value.skillId !== 'string' || !value.skillId.trim()) {
    return { ok: false, status: 400, error: 'skillId is required' }
  }

  if (value.title !== undefined && typeof value.title !== 'string') {
    return { ok: false, status: 400, error: 'title must be a string' }
  }

  if (!isPlainObject(value.payload)) {
    return { ok: false, status: 400, error: 'payload must be an object' }
  }

  const payload: Record<string, string> = {}
  for (const [key, item] of Object.entries(value.payload)) {
    if (typeof item !== 'string') {
      return { ok: false, status: 400, error: `payload.${key} must be a string` }
    }
    payload[key] = item
  }

  return {
    ok: true,
    body: {
      skillId: value.skillId.trim(),
      title: value.title,
      payload,
    },
  }
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const raw = await req.json()
    const validated = validateGenerateBody(raw)
    if (!validated.ok) {
      return NextResponse.json({ error: validated.error }, { status: validated.status })
    }
    const body = validated.body

    const skillResult = await findSkillById(body.skillId)
    if (!skillResult.ok) {
      return NextResponse.json({ error: skillResult.error }, { status: skillResult.status })
    }
    const skill = skillResult.skill

    const payload = body.payload
    const missingFields = skill.input_fields.filter(field => !payload[field]?.trim())

    if (missingFields.length > 0) {
      return NextResponse.json(
        {
          error: 'Missing required fields',
          missingFields,
        },
        { status: 400 }
      )
    }

    const prompt = buildPrompt(skill.prompt_template, payload)
    const generated = buildGeneratedMarkdown(skill.name, skill.output_sections, payload, prompt)
    const safeTitle = body.title?.trim() || `${skill.name} ${new Date().toLocaleString('ko-KR')}`

    const { data, error } = await supabase
      .from('generated_documents')
      .insert({
        skill_id: skill.id,
        title: safeTitle,
        input_payload: payload,
        generated_content: generated,
        status: 'draft',
      })
      .select('id, skill_id, title, input_payload, generated_content, status, created_at')
      .single()

    if (error) {
      return NextResponse.json(
        { error: 'Failed to save generated document' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      document: data,
      prompt,
      skill: { id: skill.id, name: skill.name, category: skill.category },
      source: skillResult.source,
      fallbackReason: skillResult.fallbackReason || null,
    })
  } catch {
    return NextResponse.json(
      { error: 'Invalid JSON body' },
      { status: 400 }
    )
  }
}
