'use client'

import { useEffect, useMemo, useState } from 'react'
import { CalendarDays, Plus, Trash2, ChevronLeft, ChevronRight, Clock3, X } from 'lucide-react'
import { useFeatureSettings } from '@/components/feature-settings-provider'
import { supabase } from '@/lib/supabase'

type ScheduleItem = {
  id: string
  title: string
  description: string
  date: string
  time: string
  created_at: string
}

function pad2(value: number) {
  return String(value).padStart(2, '0')
}

function getDateKey(date: Date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`
}

function formatKoreanDate(date: Date) {
  return `${date.getFullYear()}년 ${date.getMonth() + 1}월`
}

const days = ['일', '월', '화', '수', '목', '금', '토']
const scheduleFallbackStorageKey = 'my-dashboard-local-schedules'

function readLocalSchedules(): ScheduleItem[] {
  if (typeof window === 'undefined') return []

  try {
    const raw = window.localStorage.getItem(scheduleFallbackStorageKey)
    if (!raw) return []
    const parsed = JSON.parse(raw) as ScheduleItem[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function writeLocalSchedules(items: ScheduleItem[]) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(scheduleFallbackStorageKey, JSON.stringify(items))
}

export default function DocumentsPage() {
  const { settings } = useFeatureSettings()
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [currentDate, setCurrentDate] = useState(new Date())
  const [selectedDate, setSelectedDate] = useState(getDateKey(new Date()))
  const [items, setItems] = useState<ScheduleItem[]>([])
  const [selectedScheduleId, setSelectedScheduleId] = useState<string | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [form, setForm] = useState({ title: '', description: '', time: '09:00' })

  const calendarCells = useMemo(() => {
    const year = currentDate.getFullYear()
    const month = currentDate.getMonth()
    const firstDay = new Date(year, month, 1)
    const lastDay = new Date(year, month + 1, 0)
    const startOffset = firstDay.getDay()
    const totalDays = lastDay.getDate()

    const cells: Array<{ key: string; date: string; dayNumber: number; inMonth: boolean }> = []

    for (let i = 0; i < startOffset; i += 1) {
      const prevDate = new Date(year, month, -startOffset + i + 1)
      cells.push({
        key: `prev-${getDateKey(prevDate)}`,
        date: getDateKey(prevDate),
        dayNumber: prevDate.getDate(),
        inMonth: false,
      })
    }

    for (let day = 1; day <= totalDays; day += 1) {
      const d = new Date(year, month, day)
      cells.push({ key: getDateKey(d), date: getDateKey(d), dayNumber: day, inMonth: true })
    }

    while (cells.length % 7 !== 0) {
      const nextDate = new Date(year, month + 1, cells.length % 7)
      cells.push({
        key: `next-${getDateKey(nextDate)}`,
        date: getDateKey(nextDate),
        dayNumber: nextDate.getDate(),
        inMonth: false,
      })
    }

    return cells
  }, [currentDate])

  const selectedItems = useMemo(
    () => items.filter(item => item.date === selectedDate).sort((a, b) => a.time.localeCompare(b.time)),
    [items, selectedDate]
  )

  const selectedSchedule = useMemo(
    () => selectedItems.find(item => item.id === selectedScheduleId) || null,
    [selectedItems, selectedScheduleId]
  )

  async function fetchSchedules() {
    setLoading(true)
    setError(null)

    try {
      const { data, error: fetchError } = await supabase
        .from('schedules')
        .select('*')
        .order('date', { ascending: true })
        .order('time', { ascending: true })

      if (fetchError) throw fetchError

      setItems((data || []) as ScheduleItem[])
    } catch {
      const localItems = readLocalSchedules()
      setItems(localItems)
      setError('Supabase 연결에 실패하여 로컬 저장소 스케줄을 표시합니다.')
    } finally {
      setLoading(false)
    }
  }

  function moveMonth(offset: number) {
    setCurrentDate(prev => new Date(prev.getFullYear(), prev.getMonth() + offset, 1))
  }

  useEffect(() => {
    fetchSchedules()
  }, [])

  async function onCreateSchedule() {
    if (!settings.scheduleCreateEnabled) {
      setError('현재 설정에서 스케줄 생성 기능이 비활성화되어 있습니다.')
      return
    }

    if (!form.title.trim()) {
      setError('제목을 입력해 주세요.')
      return
    }

    setSaving(true)
    setError(null)

    try {
      const { data, error: insertError } = await supabase
        .from('schedules')
        .insert({
          title: form.title.trim(),
          description: form.description.trim(),
          date: selectedDate,
          time: form.time,
        })
        .select('*')
        .single()

      if (insertError) throw insertError

      const created = data as ScheduleItem
      setItems(prev => [created, ...prev])
      setSelectedScheduleId(created.id)
      setForm({ title: '', description: '', time: '09:00' })
      setShowCreate(false)
    } catch {
      const created: ScheduleItem = {
        id: crypto.randomUUID(),
        title: form.title.trim(),
        description: form.description.trim(),
        date: selectedDate,
        time: form.time,
        created_at: new Date().toISOString(),
      }

      setItems(prev => {
        const next = [created, ...prev]
        writeLocalSchedules(next)
        return next
      })
      setSelectedScheduleId(created.id)
      setForm({ title: '', description: '', time: '09:00' })
      setShowCreate(false)
      setError('Supabase 저장 실패: 현재 브라우저 로컬 저장소에 저장되었습니다.')
    } finally {
      setSaving(false)
    }
  }

  async function onDeleteSchedule(id: string) {
    if (!settings.scheduleDeleteEnabled) {
      setError('현재 설정에서 스케줄 삭제 기능이 비활성화되어 있습니다.')
      return
    }

    setDeletingId(id)
    setError(null)

    try {
      const { error: deleteError } = await supabase
        .from('schedules')
        .delete()
        .eq('id', id)

      if (deleteError) throw deleteError

      setItems(prev => prev.filter(item => item.id !== id))
      if (selectedScheduleId === id) {
        setSelectedScheduleId(null)
      }
    } catch {
      setItems(prev => {
        const next = prev.filter(item => item.id !== id)
        writeLocalSchedules(next)
        return next
      })
      if (selectedScheduleId === id) {
        setSelectedScheduleId(null)
      }
      setError('Supabase 삭제 실패: 로컬 저장소에서만 삭제했습니다.')
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-8">
        <div className="border-4 border-black bg-white shadow-[6px_6px_0_black] p-5 flex-1 mr-4">
          <h2 className="text-3xl font-black text-black uppercase">캘린더 · 스케줄 관리</h2>
          <p className="text-sm font-bold text-black mt-1">선택일 기준 {selectedItems.length}개 스케줄</p>
        </div>
        <button
          onClick={() => {
            setError(null)
            setShowCreate(true)
          }}
          disabled={!settings.scheduleCreateEnabled}
          className="bg-[#FFE500] border-4 border-black shadow-[4px_4px_0_black] px-6 py-4 font-black text-black uppercase flex items-center gap-2 hover:shadow-[6px_6px_0_black] hover:-translate-x-0.5 hover:-translate-y-0.5 transition-all disabled:opacity-50"
        >
          <Plus size={18} strokeWidth={2.5} />
          {settings.scheduleCreateEnabled ? '새 스케줄' : '생성 비활성'}
        </button>
      </div>

      {error && (
        <div className="mb-4 border-4 border-black bg-[#FF6B6B] px-4 py-3 font-black text-black">
          {error}
        </div>
      )}

      {loading ? (
        <div className="border-4 border-black bg-white shadow-[4px_4px_0_black] p-8 text-center">
          <p className="font-black">스케줄 로딩 중...</p>
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-4">
        <div className="col-span-2 bg-white border-4 border-black shadow-[4px_4px_0_black] p-4">
          <div className="flex items-center justify-between mb-4">
            <button
              onClick={() => moveMonth(-1)}
              className="bg-white border-2 border-black p-2 hover:shadow-[2px_2px_0_black] transition-all"
            >
              <ChevronLeft size={16} strokeWidth={2.5} />
            </button>
            <div className="flex items-center gap-2">
              <CalendarDays size={18} strokeWidth={2.5} />
              <h3 className="font-black text-lg uppercase">{formatKoreanDate(currentDate)}</h3>
            </div>
            <button
              onClick={() => moveMonth(1)}
              className="bg-white border-2 border-black p-2 hover:shadow-[2px_2px_0_black] transition-all"
            >
              <ChevronRight size={16} strokeWidth={2.5} />
            </button>
          </div>

          <div className="grid grid-cols-7 gap-2 mb-2">
            {days.map(day => (
              <div key={day} className="border-2 border-black bg-[#f5f0e8] py-2 text-center text-xs font-black uppercase">
                {day}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-2">
            {calendarCells.map(cell => {
              const count = items.filter(item => item.date === cell.date).length
              const selected = selectedDate === cell.date
              return (
                <button
                  key={cell.key}
                  onClick={() => {
                    setSelectedDate(cell.date)
                    setSelectedScheduleId(null)
                    setError(null)
                  }}
                  className={`min-h-28 border-2 border-black p-2 text-left transition-all ${selected ? 'bg-[#FFE500] shadow-[2px_2px_0_black]' : 'bg-white'} ${cell.inMonth ? '' : 'opacity-60'}`}
                >
                  <div className="text-sm font-black">{cell.dayNumber}</div>
                  <div className="mt-1 space-y-1">
                    {items
                      .filter(item => item.date === cell.date)
                      .sort((a, b) => a.time.localeCompare(b.time))
                      .slice(0, 2)
                      .map(item => (
                        <div
                          key={item.id}
                          className="border border-black bg-[#74C0FC] px-1 py-0.5 text-[10px] font-black leading-tight truncate"
                        >
                          {item.time} {item.title}
                        </div>
                      ))}
                    {count > 2 && (
                      <div className="inline-block border border-black bg-white px-1 py-0.5 text-[10px] font-black">
                        +{count - 2}개 더보기
                      </div>
                    )}
                  </div>
                </button>
              )
            })}
          </div>
        </div>

        <div className="bg-white border-4 border-black shadow-[4px_4px_0_black] p-4">
          <h3 className="font-black uppercase mb-3">상세 보기</h3>
          <p className="text-xs font-bold mb-3">{selectedDate}</p>

          {selectedItems.length === 0 ? (
            <div className="border-2 border-black bg-[#f5f0e8] p-4 text-center">
              <p className="text-sm font-black">등록된 일정이 없습니다.</p>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="border-2 border-black p-2 max-h-48 overflow-auto space-y-1">
                {selectedItems.map(item => (
                  <button
                    key={item.id}
                    onClick={() => setSelectedScheduleId(item.id)}
                    className={`w-full text-left border-2 border-black p-2 ${selectedScheduleId === item.id ? 'bg-[#FFE500]' : 'bg-white'}`}
                  >
                    <p className="text-xs font-black truncate">{item.time} · {item.title}</p>
                  </button>
                ))}
              </div>

              {selectedSchedule ? (
                <div className="border-4 border-black bg-[#f5f0e8] p-4 min-h-40">
                  <div className="flex items-center justify-between gap-2 mb-3">
                    <p className="text-lg font-black truncate">{selectedSchedule.title}</p>
                    <button
                      onClick={() => onDeleteSchedule(selectedSchedule.id)}
                      disabled={!settings.scheduleDeleteEnabled || deletingId === selectedSchedule.id}
                      className="bg-[#FF6B6B] border-2 border-black p-1.5 disabled:opacity-50"
                    >
                      <Trash2 size={12} strokeWidth={2.5} />
                    </button>
                  </div>
                  <p className="text-sm font-black flex items-center gap-1 mb-2">
                    <Clock3 size={13} strokeWidth={2.5} />
                    {selectedSchedule.date} {selectedSchedule.time}
                  </p>
                  <div className="border-2 border-black bg-white p-3 min-h-24">
                    <p className="text-sm font-bold whitespace-pre-wrap">
                      {selectedSchedule.description || '상세 설명이 없습니다.'}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="border-4 border-black bg-[#f5f0e8] p-4 min-h-40 flex items-center justify-center">
                  <p className="text-sm font-black text-center">
                    날짜가 선택되었습니다.<br />일정을 클릭하면 오른쪽에 크게 표시됩니다.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
        </div>
      )}

      {showCreate && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-8">
          <div className="bg-white border-4 border-black shadow-[8px_8px_0_black] w-full max-w-md">
            <div className="flex items-center justify-between p-4 border-b-4 border-black bg-[#FFE500]">
              <span className="font-black uppercase">스케줄 등록</span>
              <button
                onClick={() => setShowCreate(false)}
                className="border-2 border-black p-1 hover:bg-black hover:text-white transition-all"
              >
                <X size={16} strokeWidth={2.5} />
              </button>
            </div>
            <div className="p-5 space-y-3">
              <div>
                <label className="text-xs font-black uppercase block mb-1">날짜</label>
                <input
                  type="date"
                  value={selectedDate}
                  onChange={e => setSelectedDate(e.target.value)}
                  className="w-full border-4 border-black px-3 py-2 font-bold bg-white outline-none"
                />
              </div>
              <div>
                <label className="text-xs font-black uppercase block mb-1">제목</label>
                <input
                  type="text"
                  value={form.title}
                  onChange={e => setForm(prev => ({ ...prev, title: e.target.value }))}
                  className="w-full border-4 border-black px-3 py-2 font-bold bg-white outline-none"
                  placeholder="회의, 마감, 점검..."
                />
              </div>
              <div>
                <label className="text-xs font-black uppercase block mb-1">시간</label>
                <input
                  type="time"
                  value={form.time}
                  onChange={e => setForm(prev => ({ ...prev, time: e.target.value }))}
                  className="w-full border-4 border-black px-3 py-2 font-bold bg-white outline-none"
                />
              </div>
              <div>
                <label className="text-xs font-black uppercase block mb-1">설명</label>
                <textarea
                  value={form.description}
                  onChange={e => setForm(prev => ({ ...prev, description: e.target.value }))}
                  className="w-full border-4 border-black px-3 py-2 font-bold bg-white outline-none resize-none h-20"
                  placeholder="세부 내용을 입력하세요"
                />
              </div>

              <div className="flex gap-2">
                <button
                  onClick={onCreateSchedule}
                  disabled={!settings.scheduleCreateEnabled || saving}
                  className="bg-[#69DB7C] border-4 border-black px-5 py-2 font-black uppercase disabled:opacity-50"
                >
                  {saving ? '저장 중...' : '저장'}
                </button>
                <button
                  onClick={() => setShowCreate(false)}
                  className="bg-white border-4 border-black px-5 py-2 font-black uppercase"
                >
                  취소
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
