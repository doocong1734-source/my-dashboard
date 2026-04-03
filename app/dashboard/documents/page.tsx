'use client'

import { useEffect, useMemo, useState, useCallback } from 'react'
import { Plus, ChevronLeft, ChevronRight, X, RefreshCw, Trash2, Clock3 } from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────────────

type CalEvent = { id: string; title: string; description: string; start: string; end: string; allDay: boolean }
type CalendarInfo = { id: string; name: string; color: string; enabled: boolean }

type ParsedEvent = CalEvent & {
  startDate: string  // YYYY-MM-DD
  endDate: string    // YYYY-MM-DD inclusive
  startTime: string  // HH:MM or ''
  color: string
}

type EventSeg = {
  ev: ParsedEvent
  startCol: number
  endCol: number
  isStart: boolean
  isEnd: boolean
  lane: number
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const pad2 = (v: number) => String(v).padStart(2, '0')
const toDateKey = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`
const addDays = (ds: string, n: number): string => {
  const d = new Date(ds + 'T00:00:00')
  d.setDate(d.getDate() + n)
  return toDateKey(d)
}
const dayOfWeek = (ds: string) => new Date(ds + 'T00:00:00').getDay()

const TODAY = toDateKey(new Date())
const DAYS = ['일', '월', '화', '수', '목', '금', '토']
const COLORS = ['#74C0FC', '#B197FC', '#69DB7C', '#FF6B6B', '#FFD43B', '#FFA94D', '#63E6BE', '#F783AC']
const LANE_H = 22
const DATE_H = 26

// ─── Event parsing ─────────────────────────────────────────────────────────────

function parseEventWithColor(ev: CalEvent, color: string): ParsedEvent {
  if (ev.allDay) {
    const startDate = ev.start.slice(0, 10)
    // Google Calendar: allDay end is exclusive — subtract 1 day
    const endD = new Date(ev.end.slice(0, 10) + 'T00:00:00')
    endD.setDate(endD.getDate() - 1)
    return { ...ev, startDate, endDate: toDateKey(endD), startTime: '', color }
  }
  const s = new Date(ev.start), e = new Date(ev.end)
  return { ...ev, startDate: toDateKey(s), endDate: toDateKey(e), startTime: `${pad2(s.getHours())}:${pad2(s.getMinutes())}`, color }
}

function parseEvent(ev: CalEvent, colorIdx: number): ParsedEvent {
  return parseEventWithColor(ev, COLORS[colorIdx % COLORS.length])
}

// ─── Lane assignment for spanning events ──────────────────────────────────────

function getWeekSpanSegs(events: ParsedEvent[], weekStart: string): EventSeg[] {
  const weekEnd = addDays(weekStart, 6)

  const relevant = events
    .filter(ev => ev.endDate >= weekStart && ev.startDate <= weekEnd)
    .map(ev => ({
      ev,
      startCol: ev.startDate < weekStart ? 0 : dayOfWeek(ev.startDate),
      endCol: ev.endDate > weekEnd ? 6 : dayOfWeek(ev.endDate),
      isStart: ev.startDate >= weekStart,
      isEnd: ev.endDate <= weekEnd,
    }))
    .sort((a, b) => a.startCol !== b.startCol
      ? a.startCol - b.startCol
      : (b.endCol - b.startCol) - (a.endCol - a.startCol))

  const lanes: { s: number; e: number }[][] = []
  return relevant.map(seg => {
    let lane = 0
    for (;;) {
      if (!lanes[lane]) lanes[lane] = []
      const occupied = lanes[lane].some(l => l.s <= seg.endCol && l.e >= seg.startCol)
      if (!occupied) {
        lanes[lane].push({ s: seg.startCol, e: seg.endCol })
        return { ...seg, lane }
      }
      lane++
    }
  })
}

// ─── WeekRow ──────────────────────────────────────────────────────────────────

function WeekRow({ weekStart, currentMonth, events, selectedDate, onDayClick, onEventClick }: {
  weekStart: string
  currentMonth: number
  events: ParsedEvent[]
  selectedDate: string
  onDayClick: (date: string) => void
  onEventClick: (ev: ParsedEvent, e: React.MouseEvent<HTMLElement>) => void
}) {
  const weekDates = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart])

  const spanSegs = useMemo(() => getWeekSpanSegs(
    events.filter(ev => ev.allDay || ev.startDate !== ev.endDate),
    weekStart
  ), [events, weekStart])

  const maxLane = spanSegs.reduce((m, s) => Math.max(m, s.lane), -1)
  const bandH = maxLane >= 0 ? (maxLane + 1) * LANE_H + 4 : 0

  return (
    <div className="border-b-2 border-black last:border-b-0 relative" style={{ minHeight: DATE_H + bandH + 56 }}>
      {/* Click-target background cells */}
      <div className="absolute inset-0 grid grid-cols-7">
        {weekDates.map(date => (
          <div
            key={date}
            onClick={() => onDayClick(date)}
            className={`border-r-2 border-black last:border-r-0 cursor-pointer transition-colors
              ${selectedDate === date ? 'bg-[#fff8c0]' : 'hover:bg-gray-50'}`}
          />
        ))}
      </div>

      {/* Date numbers */}
      <div className="relative grid grid-cols-7 pointer-events-none" style={{ height: DATE_H }}>
        {weekDates.map((date, i) => {
          const isThisMonth = parseInt(date.slice(5, 7)) - 1 === currentMonth
          const isToday = date === TODAY
          return (
            <div key={date} className="px-2 pt-1.5 flex justify-start">
              <span className={`text-xs font-black w-5 h-5 flex items-center justify-center rounded-full
                ${isToday ? 'bg-[#FFE500] border-2 border-black text-black' : ''}
                ${!isThisMonth ? 'text-gray-400' : i === 0 ? 'text-red-600' : i === 6 ? 'text-blue-600' : 'text-black'}`}>
                {parseInt(date.slice(8))}
              </span>
            </div>
          )
        })}
      </div>

      {/* All-day / multi-day event bars */}
      {bandH > 0 && (
        <div className="relative" style={{ height: bandH }}>
          {spanSegs.map(({ ev, startCol, endCol, isStart, isEnd, lane }) => (
            <div
              key={`${ev.id}-${weekStart}`}
              className="absolute flex items-center cursor-pointer overflow-hidden text-xs font-bold"
              style={{
                left: `calc(${(startCol / 7) * 100}% + 1px)`,
                width: `calc(${((endCol - startCol + 1) / 7) * 100}% - 2px)`,
                top: lane * LANE_H + 2,
                height: LANE_H - 4,
                backgroundColor: ev.color,
                paddingLeft: isStart ? 6 : 2,
                paddingRight: 4,
                borderRadius: `${isStart ? 3 : 0}px ${isEnd ? 3 : 0}px ${isEnd ? 3 : 0}px ${isStart ? 3 : 0}px`,
                border: '1.5px solid rgba(0,0,0,0.25)',
                borderLeft: isStart ? '1.5px solid rgba(0,0,0,0.25)' : 'none',
              }}
              onClick={(e) => { e.stopPropagation(); onEventClick(ev, e) }}
            >
              {isStart && (
                <span className="truncate">{ev.startTime ? `${ev.startTime} ` : ''}{ev.title}</span>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Single-day timed events */}
      <div className="relative grid grid-cols-7">
        {weekDates.map(date => {
          const timedEvs = events.filter(ev => !ev.allDay && ev.startDate === date && ev.endDate === date)
          return (
            <div key={date} className="border-r-2 border-black last:border-r-0 min-h-14 px-1 pt-0.5 pb-1 space-y-0.5">
              {timedEvs.slice(0, 3).map(ev => (
                <div
                  key={ev.id}
                  className="text-[10px] font-bold truncate cursor-pointer rounded px-1 py-px"
                  style={{ backgroundColor: ev.color, border: '1px solid rgba(0,0,0,0.2)' }}
                  onClick={(e) => { e.stopPropagation(); onEventClick(ev, e) }}
                >
                  {ev.startTime} {ev.title}
                </div>
              ))}
              {timedEvs.length > 3 && (
                <div className="text-[10px] font-black text-gray-500 px-1">+{timedEvs.length - 3}개</div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Main page ─────────────────────────────────────────────────────────────────

export default function DocumentsPage() {
  const [events, setEvents] = useState<ParsedEvent[]>([])
  const [calendars, setCalendars] = useState<CalendarInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [currentDate, setCurrentDate] = useState(new Date())
  const [selectedDate, setSelectedDate] = useState(TODAY)

  // Create modal
  const [showCreate, setShowCreate] = useState(false)
  const [createDate, setCreateDate] = useState(TODAY)
  const [form, setForm] = useState({ title: '', description: '', time: '09:00' })
  const [saving, setSaving] = useState(false)

  // Event detail popup
  const [popup, setPopup] = useState<{ ev: ParsedEvent; x: number; y: number } | null>(null)
  const [isEditing, setIsEditing] = useState(false)
  const [editForm, setEditForm] = useState({ title: '', description: '', time: '', date: '' })
  const [deleting, setDeleting] = useState(false)
  const [updating, setUpdating] = useState(false)

  // Calendar weeks
  const weeks = useMemo(() => {
    const y = currentDate.getFullYear(), m = currentDate.getMonth()
    const firstDay = new Date(y, m, 1)
    const startSunday = new Date(firstDay)
    startSunday.setDate(firstDay.getDate() - firstDay.getDay())
    const lastDay = new Date(y, m + 1, 0)
    const endSaturday = new Date(lastDay)
    endSaturday.setDate(lastDay.getDate() + (6 - lastDay.getDay()))
    const weekStarts: string[] = []
    const d = new Date(startSunday)
    while (d <= endSaturday) {
      weekStarts.push(toDateKey(d))
      d.setDate(d.getDate() + 7)
    }
    return weekStarts
  }, [currentDate])

  // Load calendar list once
  useEffect(() => {
    fetch('/api/calendar/calendars')
      .then(r => r.json())
      .then((d: { calendars?: Array<{ id: string; name: string; color: string; selected: boolean }> }) => {
        if (d.calendars) {
          setCalendars(d.calendars.map(c => ({ ...c, enabled: c.selected })))
        }
      })
      .catch(() => {})
  }, [])

  const enabledCalendarIds = useMemo(
    () => calendars.filter(c => c.enabled).map(c => c.id),
    [calendars]
  )

  const fetchEvents = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const y = currentDate.getFullYear(), m = currentDate.getMonth()
      const timeMin = new Date(y, m, 1).toISOString()
      const timeMax = new Date(y, m + 1, 0, 23, 59, 59).toISOString()

      const ids = enabledCalendarIds.length > 0 ? enabledCalendarIds : ['primary']
      const allEvents: CalEvent[] = []
      const calColorMap = Object.fromEntries(calendars.map(c => [c.id, c.color]))

      await Promise.all(ids.map(async (calId, calIdx) => {
        try {
          const res = await fetch(
            `/api/calendar/events?timeMin=${encodeURIComponent(timeMin)}&timeMax=${encodeURIComponent(timeMax)}&calendarId=${encodeURIComponent(calId)}`
          )
          if (!res.ok) return
          const data = (await res.json()) as { events: CalEvent[] }
          // Tag events with their calendar color
          const calColor = calColorMap[calId] || COLORS[calIdx % COLORS.length]
          data.events.forEach(ev => {
            allEvents.push({ ...ev, _calColor: calColor } as CalEvent & { _calColor: string })
          })
        } catch { /* skip failed calendar */ }
      }))

      let colorIdx = 0
      setEvents(allEvents.map(ev => {
        const color = (ev as CalEvent & { _calColor?: string })._calColor || COLORS[colorIdx % COLORS.length]
        colorIdx++
        return parseEventWithColor(ev, color)
      }))
    } catch (e) {
      setError(e instanceof Error ? e.message : '불러오기 실패')
    } finally {
      setLoading(false)
    }
  }, [currentDate, enabledCalendarIds, calendars])

  useEffect(() => { fetchEvents() }, [fetchEvents])

  const handleDayClick = (date: string) => {
    setSelectedDate(date)
    setPopup(null)
  }

  const handleEventClick = (ev: ParsedEvent, e: React.MouseEvent<HTMLElement>) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    const popupW = 288
    const x = Math.max(8, Math.min(rect.left, window.innerWidth - popupW - 8))
    const y = Math.min(rect.bottom + 6, window.innerHeight - 280)
    setPopup({ ev, x, y })
    setEditForm({ title: ev.title, description: ev.description, time: ev.startTime, date: ev.startDate })
    setIsEditing(false)
  }

  const handleCreate = async () => {
    if (!form.title.trim()) return
    setSaving(true)
    try {
      const res = await fetch('/api/calendar/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: form.title, description: form.description, date: createDate, time: form.time }),
      })
      if (!res.ok) throw new Error(((await res.json()) as { error?: string }).error || 'Failed')
      const { event } = (await res.json()) as { event: CalEvent }
      setEvents(prev => [...prev, parseEvent(event, prev.length)])
      setShowCreate(false)
      setForm({ title: '', description: '', time: '09:00' })
    } catch (e) {
      setError(e instanceof Error ? e.message : '생성 실패')
    } finally {
      setSaving(false)
    }
  }

  const handleUpdate = async () => {
    if (!popup || !editForm.title.trim()) return
    setUpdating(true)
    try {
      const res = await fetch(`/api/calendar/events?eventId=${encodeURIComponent(popup.ev.id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: editForm.title, description: editForm.description, time: editForm.time, date: editForm.date }),
      })
      if (!res.ok) throw new Error('수정 실패')
      const { event } = (await res.json()) as { event: CalEvent }
      const colorIdx = events.findIndex(ev => ev.id === popup.ev.id)
      const updated = parseEvent(event, colorIdx >= 0 ? colorIdx : 0)
      setEvents(prev => prev.map(ev => ev.id === popup.ev.id ? updated : ev))
      setPopup(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : '수정 실패')
    } finally {
      setUpdating(false)
    }
  }

  const handleDelete = async (id: string) => {
    setDeleting(true)
    try {
      const res = await fetch(`/api/calendar/events?eventId=${encodeURIComponent(id)}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('삭제 실패')
      setEvents(prev => prev.filter(ev => ev.id !== id))
      setPopup(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : '삭제 실패')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="h-full flex flex-col bg-[#f5f0e8] font-mono" onClick={() => setPopup(null)}>
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-3 border-b-4 border-black bg-white shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setCurrentDate(prev => new Date(prev.getFullYear(), prev.getMonth() - 1, 1))}
            className="border-2 border-black p-1.5 bg-white hover:shadow-[2px_2px_0_black] transition-all"
          >
            <ChevronLeft size={16} strokeWidth={2.5} />
          </button>
          <h2 className="text-lg font-black uppercase min-w-40 text-center">
            {currentDate.getFullYear()}년 {currentDate.getMonth() + 1}월
          </h2>
          <button
            onClick={() => setCurrentDate(prev => new Date(prev.getFullYear(), prev.getMonth() + 1, 1))}
            className="border-2 border-black p-1.5 bg-white hover:shadow-[2px_2px_0_black] transition-all"
          >
            <ChevronRight size={16} strokeWidth={2.5} />
          </button>
          <button
            onClick={() => setCurrentDate(new Date())}
            className="border-2 border-black px-3 py-1 text-xs font-black bg-white hover:bg-[#FFE500] transition-all"
          >
            오늘
          </button>
        </div>
        <div className="flex gap-2">
          <button onClick={() => fetchEvents()} className="border-2 border-black p-1.5 bg-white hover:shadow-[2px_2px_0_black] transition-all">
            <RefreshCw size={15} strokeWidth={2.5} />
          </button>
          <button
            onClick={() => { setCreateDate(selectedDate); setShowCreate(true) }}
            className="bg-[#FFE500] border-2 border-black px-4 py-1.5 font-black text-sm flex items-center gap-1 hover:shadow-[3px_3px_0_black] transition-all"
          >
            <Plus size={14} strokeWidth={2.5} /> 새 일정
          </button>
        </div>
      </div>

      {error && (
        <div className="mx-4 mt-2 shrink-0 border-2 border-black bg-[#FF6B6B] px-3 py-2 text-xs font-black flex justify-between items-center">
          <span>{error}</span>
          <button onClick={() => setError(null)}><X size={12} /></button>
        </div>
      )}

      {/* Body: sidebar + calendar */}
      <div className="flex-1 overflow-hidden flex">
        {/* Calendar list sidebar */}
        {calendars.length > 0 && (
          <div className="w-44 shrink-0 border-r-4 border-black bg-white overflow-auto p-3 space-y-1">
            <p className="text-[10px] font-black uppercase text-gray-500 mb-2">내 캘린더</p>
            {calendars.map(cal => (
              <button
                key={cal.id}
                onClick={() => setCalendars(prev => prev.map(c => c.id === cal.id ? { ...c, enabled: !c.enabled } : c))}
                className="flex items-center gap-2 w-full text-left hover:bg-gray-50 px-1 py-1 rounded transition-colors"
              >
                <span className="w-3 h-3 rounded-sm shrink-0 border border-black/20"
                  style={{ backgroundColor: cal.enabled ? cal.color : '#e5e7eb' }} />
                <span className={`text-xs font-bold truncate ${cal.enabled ? 'text-black' : 'text-gray-400'}`}>
                  {cal.name}
                </span>
              </button>
            ))}
          </div>
        )}

        {/* Calendar grid */}
        <div className="flex-1 overflow-auto px-4 py-2">
        {loading ? (
          <div className="p-8 text-center font-black border-4 border-black bg-white mt-2">
            Google Calendar 로딩 중...
          </div>
        ) : (
          <div className="border-4 border-black bg-white shadow-[4px_4px_0_black]">
            {/* Day headers */}
            <div className="grid grid-cols-7 border-b-4 border-black bg-[#f5f0e8]">
              {DAYS.map((day, i) => (
                <div key={day} className={`py-2 text-center text-xs font-black border-r-2 border-black last:border-r-0
                  ${i === 0 ? 'text-red-600' : i === 6 ? 'text-blue-600' : 'text-black'}`}>
                  {day}
                </div>
              ))}
            </div>

            {/* Weeks */}
            {weeks.map(weekStart => (
              <WeekRow
                key={weekStart}
                weekStart={weekStart}
                currentMonth={currentDate.getMonth()}
                events={events}
                selectedDate={selectedDate}
                onDayClick={(date) => {
                  handleDayClick(date)
                  setCreateDate(date)
                }}
                onEventClick={handleEventClick}
              />
            ))}
          </div>
        )}
        </div>
      </div>

      {/* Event detail popup */}
      {popup && (
        <div
          className="fixed z-50 bg-white border-4 border-black shadow-[6px_6px_0_black] w-72"
          style={{ left: popup.x, top: popup.y }}
          onClick={e => e.stopPropagation()}
        >
          <div className="border-b-4 border-black px-3 py-2 flex items-center justify-between"
            style={{ backgroundColor: popup.ev.color }}>
            <span className="font-black text-sm truncate flex-1 text-black">{popup.ev.title}</span>
            <div className="flex gap-1">
              <button
                onClick={() => setIsEditing(v => !v)}
                className="border-2 border-black p-1 bg-white hover:bg-gray-100 text-black"
                title="편집"
              >
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                </svg>
              </button>
              <button onClick={() => setPopup(null)} className="border-2 border-black p-1 bg-white hover:bg-gray-100">
                <X size={11} />
              </button>
            </div>
          </div>

          {isEditing ? (
            <div className="p-3 space-y-2">
              <input
                value={editForm.title}
                onChange={e => setEditForm(p => ({ ...p, title: e.target.value }))}
                className="w-full border-2 border-black px-2 py-1.5 text-sm font-bold outline-none"
                placeholder="제목"
                autoFocus
              />
              <input
                type="date"
                value={editForm.date}
                onChange={e => setEditForm(p => ({ ...p, date: e.target.value }))}
                className="w-full border-2 border-black px-2 py-1.5 text-sm font-bold outline-none"
              />
              {!popup.ev.allDay && (
                <input
                  type="time"
                  value={editForm.time}
                  onChange={e => setEditForm(p => ({ ...p, time: e.target.value }))}
                  className="w-full border-2 border-black px-2 py-1.5 text-sm font-bold outline-none"
                />
              )}
              <textarea
                value={editForm.description}
                onChange={e => setEditForm(p => ({ ...p, description: e.target.value }))}
                className="w-full border-2 border-black px-2 py-1.5 text-sm font-bold outline-none resize-none h-16"
                placeholder="설명"
              />
              <div className="flex gap-2">
                <button onClick={handleUpdate} disabled={updating}
                  className="bg-[#69DB7C] border-2 border-black px-3 py-1.5 text-xs font-black disabled:opacity-50">
                  {updating ? '저장중...' : '저장'}
                </button>
                <button onClick={() => setIsEditing(false)} className="bg-white border-2 border-black px-3 py-1.5 text-xs font-black">취소</button>
              </div>
            </div>
          ) : (
            <div className="p-3 space-y-2">
              <p className="text-xs font-bold flex items-center gap-1.5">
                <Clock3 size={12} strokeWidth={2.5} />
                {popup.ev.startDate}{popup.ev.startTime ? ` ${popup.ev.startTime}` : ' (종일)'}
                {popup.ev.startDate !== popup.ev.endDate && ` ~ ${popup.ev.endDate}`}
              </p>
              {popup.ev.description && (
                <p className="text-xs border-2 border-black bg-[#f5f0e8] p-2 font-medium whitespace-pre-wrap max-h-24 overflow-auto">
                  {popup.ev.description}
                </p>
              )}
              <button
                onClick={() => handleDelete(popup.ev.id)}
                disabled={deleting}
                className="w-full bg-[#FF6B6B] border-2 border-black py-1.5 text-xs font-black flex items-center justify-center gap-1.5 disabled:opacity-50 hover:shadow-[2px_2px_0_black] transition-all"
              >
                <Trash2 size={12} /> {deleting ? '삭제 중...' : '일정 삭제'}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Create modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
          <div className="bg-white border-4 border-black shadow-[8px_8px_0_black] w-full max-w-md">
            <div className="flex items-center justify-between p-4 border-b-4 border-black bg-[#FFE500]">
              <span className="font-black uppercase">새 일정</span>
              <button onClick={() => setShowCreate(false)} className="border-2 border-black p-1 hover:bg-black hover:text-white transition-all">
                <X size={16} strokeWidth={2.5} />
              </button>
            </div>
            <div className="p-5 space-y-3">
              <div>
                <label className="text-xs font-black uppercase block mb-1">날짜</label>
                <input type="date" value={createDate} onChange={e => setCreateDate(e.target.value)}
                  className="w-full border-4 border-black px-3 py-2 font-bold bg-white outline-none" />
              </div>
              <div>
                <label className="text-xs font-black uppercase block mb-1">제목</label>
                <input type="text" value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))}
                  onKeyDown={e => e.key === 'Enter' && handleCreate()}
                  className="w-full border-4 border-black px-3 py-2 font-bold bg-white outline-none"
                  placeholder="회의, 마감, 점검..." autoFocus />
              </div>
              <div>
                <label className="text-xs font-black uppercase block mb-1">시간</label>
                <input type="time" value={form.time} onChange={e => setForm(p => ({ ...p, time: e.target.value }))}
                  className="w-full border-4 border-black px-3 py-2 font-bold bg-white outline-none" />
              </div>
              <div>
                <label className="text-xs font-black uppercase block mb-1">설명 (선택)</label>
                <textarea value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
                  className="w-full border-4 border-black px-3 py-2 font-bold bg-white outline-none resize-none h-20"
                  placeholder="세부 내용" />
              </div>
              <div className="flex gap-2">
                <button onClick={handleCreate} disabled={saving}
                  className="bg-[#69DB7C] border-4 border-black px-5 py-2 font-black uppercase disabled:opacity-50">
                  {saving ? '저장 중...' : '저장'}
                </button>
                <button onClick={() => setShowCreate(false)} className="bg-white border-4 border-black px-5 py-2 font-black uppercase">취소</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
