import { supabase } from '@/lib/supabase'
import { defaultSkillTemplates, type SkillTemplate } from '@/lib/skill-templates'

type SkillRow = {
  id: unknown
  name: unknown
  category: unknown
  input_fields: unknown
  output_sections: unknown
  prompt_template: unknown
}

type LoadSkillsResult =
  | { ok: true; skills: SkillTemplate[]; source: 'database' | 'default'; fallbackReason?: string }
  | { ok: false; status: number; error: string }

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(item => typeof item === 'string')
}

function normalizeSkillRow(row: SkillRow): SkillTemplate | null {
  if (
    typeof row.id !== 'string' ||
    typeof row.name !== 'string' ||
    typeof row.category !== 'string' ||
    typeof row.prompt_template !== 'string' ||
    !isStringArray(row.input_fields) ||
    !isStringArray(row.output_sections)
  ) {
    return null
  }

  return {
    id: row.id,
    name: row.name,
    category: row.category,
    input_fields: row.input_fields,
    output_sections: row.output_sections,
    prompt_template: row.prompt_template,
  }
}

function isTableMissingError(code?: string, message?: string) {
  if (code === '42P01' || code === 'PGRST205') {
    return true
  }

  if (!message) return false
  return message.toLowerCase().includes('relation') && message.toLowerCase().includes('skills')
}

export async function loadSkills(): Promise<LoadSkillsResult> {
  try {
    const { data, error } = await supabase
      .from('skills')
      .select('id, name, category, input_fields, output_sections, prompt_template')
      .order('name', { ascending: true })

    if (error) {
      if (isTableMissingError(error.code, error.message)) {
        return { ok: true, skills: defaultSkillTemplates, source: 'default', fallbackReason: 'table-missing' }
      }

      return { ok: false, status: 500, error: 'Failed to load skills from database' }
    }

    const rows = (data || []) as SkillRow[]
    const normalized = rows
      .map(normalizeSkillRow)
      .filter((item): item is SkillTemplate => item !== null)

    if (normalized.length === 0) {
      return { ok: true, skills: defaultSkillTemplates, source: 'default', fallbackReason: 'empty-or-invalid' }
    }

    return { ok: true, skills: normalized, source: 'database' }
  } catch {
    return { ok: false, status: 500, error: 'Unexpected error while loading skills' }
  }
}

export async function findSkillById(skillId: string) {
  const loaded = await loadSkills()
  if (!loaded.ok) return loaded

  const skill = loaded.skills.find(item => item.id === skillId)
  if (!skill) {
    return { ok: false as const, status: 400, error: 'Invalid skillId' }
  }

  return {
    ok: true as const,
    skill,
    source: loaded.source,
    fallbackReason: loaded.fallbackReason,
  }
}
