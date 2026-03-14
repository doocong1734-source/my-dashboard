import { getServerSession } from 'next-auth'
import { NextResponse } from 'next/server'
import { authOptions } from '@/lib/auth'
import { supabase } from '@/lib/supabase'
import { loadSkills } from '@/lib/skills-store'

type CreateSkillBody = {
  id: string
  name: string
  category: string
  input_fields: string[]
  output_sections: string[]
  prompt_template: string
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(item => typeof item === 'string')
}

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const loaded = await loadSkills()
  if (!loaded.ok) {
    return NextResponse.json({ error: loaded.error }, { status: loaded.status })
  }

  return NextResponse.json({
    skills: loaded.skills,
    source: loaded.source,
    fallbackReason: loaded.fallbackReason || null,
  })
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const raw = await req.json()
    if (!isPlainObject(raw)) {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
    }

    const body: CreateSkillBody = {
      id: typeof raw.id === 'string' ? raw.id.trim() : '',
      name: typeof raw.name === 'string' ? raw.name.trim() : '',
      category: typeof raw.category === 'string' ? raw.category.trim() : '',
      input_fields: isStringArray(raw.input_fields) ? raw.input_fields.map(v => v.trim()).filter(Boolean) : [],
      output_sections: isStringArray(raw.output_sections) ? raw.output_sections.map(v => v.trim()).filter(Boolean) : [],
      prompt_template: typeof raw.prompt_template === 'string' ? raw.prompt_template.trim() : '',
    }

    if (!body.id || !body.name || !body.category || !body.prompt_template) {
      return NextResponse.json({ error: 'id, name, category, prompt_template are required' }, { status: 400 })
    }

    if (body.input_fields.length === 0 || body.output_sections.length === 0) {
      return NextResponse.json({ error: 'input_fields and output_sections are required' }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('skills')
      .upsert(body)
      .select('id, name, category, input_fields, output_sections, prompt_template')
      .single()

    if (error) {
      return NextResponse.json({ error: 'Failed to save skill template' }, { status: 500 })
    }

    return NextResponse.json({ skill: data })
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
}
