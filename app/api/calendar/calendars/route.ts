import { NextRequest, NextResponse } from 'next/server'
import { getDriveAccessToken } from '@/lib/drive-auth'

export async function GET(req: NextRequest) {
  const auth = await getDriveAccessToken(req, ['drive.read'])
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  try {
    const res = await fetch(
      'https://www.googleapis.com/calendar/v3/users/me/calendarList?maxResults=50',
      { headers: { Authorization: `Bearer ${auth.accessToken}` } }
    )
    if (!res.ok) {
      const err = await res.json() as { error?: { message?: string } }
      return NextResponse.json({ error: err?.error?.message || 'Failed' }, { status: res.status })
    }
    const data = await res.json() as {
      items?: Array<{
        id: string
        summary: string
        backgroundColor?: string
        foregroundColor?: string
        selected?: boolean
        accessRole?: string
      }>
    }
    const calendars = (data.items || []).map(c => ({
      id: c.id,
      name: c.summary,
      color: c.backgroundColor || '#74C0FC',
      selected: c.selected !== false,
    }))
    return NextResponse.json({ calendars })
  } catch {
    return NextResponse.json({ error: 'Failed to list calendars' }, { status: 500 })
  }
}
