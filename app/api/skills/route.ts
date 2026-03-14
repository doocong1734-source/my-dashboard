import { getServerSession } from 'next-auth'
import { NextResponse } from 'next/server'
import { authOptions } from '@/lib/auth'
import { loadSkills } from '@/lib/skills-store'

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
