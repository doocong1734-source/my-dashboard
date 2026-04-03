import { NextRequest, NextResponse } from 'next/server'
import { getDriveAccessToken } from '@/lib/drive-auth'

const CALENDAR_BASE = 'https://www.googleapis.com/calendar/v3/calendars/primary/events'

async function getToken(req: NextRequest) {
  const auth = await getDriveAccessToken(req, ['drive.read'])
  if (!auth.ok) return { token: null, error: auth.error, status: auth.status }
  return { token: auth.accessToken, error: null, status: 200 }
}

// GET /api/calendar/events?timeMin=...&timeMax=...
export async function GET(req: NextRequest) {
  const { token, error, status } = await getToken(req)
  if (!token) return NextResponse.json({ error }, { status })

  const { searchParams } = req.nextUrl
  const timeMin = searchParams.get('timeMin')
  const timeMax = searchParams.get('timeMax')

  const params = new URLSearchParams({
    maxResults: '100',
    singleEvents: 'true',
    orderBy: 'startTime',
  })
  if (timeMin) params.set('timeMin', timeMin)
  if (timeMax) params.set('timeMax', timeMax)

  try {
    const res = await fetch(`${CALENDAR_BASE}?${params}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok) {
      try {
        const errJson = await res.json() as { error?: { message?: string } }
        const msg = errJson?.error?.message || `Calendar API error (${res.status})`
        return NextResponse.json({ error: msg }, { status: res.status })
      } catch {
        return NextResponse.json({ error: `Calendar API error (${res.status})` }, { status: res.status })
      }
    }
    const data = await res.json()
    const events = (data.items || []).map((item: {
      id: string
      summary?: string
      description?: string
      start?: { dateTime?: string; date?: string }
      end?: { dateTime?: string; date?: string }
    }) => ({
      id: item.id,
      title: item.summary || '(제목 없음)',
      description: item.description || '',
      start: item.start?.dateTime || item.start?.date || '',
      end: item.end?.dateTime || item.end?.date || '',
      allDay: !item.start?.dateTime,
    }))
    return NextResponse.json({ events })
  } catch {
    return NextResponse.json({ error: 'Failed to fetch events' }, { status: 500 })
  }
}

// POST /api/calendar/events  body: { title, description, date, time, endTime? }
export async function POST(req: NextRequest) {
  const { token, error, status } = await getToken(req)
  if (!token) return NextResponse.json({ error }, { status })

  try {
    const body = await req.json() as {
      title: string
      description?: string
      date: string
      time: string
      endTime?: string
    }
    const { title, description, date, time, endTime } = body

    const startDateTime = `${date}T${time}:00`
    const endDateTime = endTime ? `${date}T${endTime}:00` : `${date}T${time.split(':')[0].padStart(2,'0')}:${String(parseInt(time.split(':')[1]) + 30).padStart(2,'0')}:00`

    const event = {
      summary: title,
      description: description || '',
      start: { dateTime: startDateTime, timeZone: 'Asia/Seoul' },
      end: { dateTime: endDateTime, timeZone: 'Asia/Seoul' },
    }

    const res = await fetch(CALENDAR_BASE, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(event),
    })

    if (!res.ok) {
      const errBody = await res.text()
      return NextResponse.json({ error: errBody }, { status: res.status })
    }

    const created = await res.json() as {
      id: string
      summary?: string
      description?: string
      start?: { dateTime?: string; date?: string }
      end?: { dateTime?: string; date?: string }
    }
    return NextResponse.json({
      event: {
        id: created.id,
        title: created.summary || title,
        description: created.description || '',
        start: created.start?.dateTime || created.start?.date || '',
        end: created.end?.dateTime || created.end?.date || '',
        allDay: false,
      }
    })
  } catch {
    return NextResponse.json({ error: 'Failed to create event' }, { status: 500 })
  }
}

// PATCH /api/calendar/events?eventId=...  body: { title, description, date, time }
export async function PATCH(req: NextRequest) {
  const { token, error, status } = await getToken(req)
  if (!token) return NextResponse.json({ error }, { status })

  const eventId = req.nextUrl.searchParams.get('eventId')
  if (!eventId) return NextResponse.json({ error: 'eventId required' }, { status: 400 })

  try {
    const body = await req.json() as { title?: string; description?: string; date?: string; time?: string }
    const patchBody: Record<string, unknown> = {}
    if (body.title !== undefined) patchBody.summary = body.title
    if (body.description !== undefined) patchBody.description = body.description
    if (body.date && body.time) {
      const startDateTime = `${body.date}T${body.time}:00`
      const [h, m] = body.time.split(':').map(Number)
      const endM = m + 30
      const endH = h + Math.floor(endM / 60)
      const endDateTime = `${body.date}T${String(endH).padStart(2,'0')}:${String(endM % 60).padStart(2,'0')}:00`
      patchBody.start = { dateTime: startDateTime, timeZone: 'Asia/Seoul' }
      patchBody.end = { dateTime: endDateTime, timeZone: 'Asia/Seoul' }
    }

    const res = await fetch(`${CALENDAR_BASE}/${encodeURIComponent(eventId)}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(patchBody),
    })

    if (!res.ok) {
      const errBody = await res.text()
      return NextResponse.json({ error: errBody }, { status: res.status })
    }

    const updated = await res.json() as {
      id: string; summary?: string; description?: string;
      start?: { dateTime?: string; date?: string }; end?: { dateTime?: string; date?: string }
    }
    return NextResponse.json({
      event: {
        id: updated.id,
        title: updated.summary || '',
        description: updated.description || '',
        start: updated.start?.dateTime || updated.start?.date || '',
        end: updated.end?.dateTime || updated.end?.date || '',
        allDay: !updated.start?.dateTime,
      }
    })
  } catch {
    return NextResponse.json({ error: 'Failed to update event' }, { status: 500 })
  }
}

// DELETE /api/calendar/events?eventId=...
export async function DELETE(req: NextRequest) {
  const { token, error, status } = await getToken(req)
  if (!token) return NextResponse.json({ error }, { status })

  const eventId = req.nextUrl.searchParams.get('eventId')
  if (!eventId) return NextResponse.json({ error: 'eventId required' }, { status: 400 })

  try {
    const res = await fetch(`${CALENDAR_BASE}/${encodeURIComponent(eventId)}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    })

    if (!res.ok && res.status !== 404) {
      const errBody = await res.text()
      return NextResponse.json({ error: errBody }, { status: res.status })
    }

    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'Failed to delete event' }, { status: 500 })
  }
}
