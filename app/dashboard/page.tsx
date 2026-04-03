'use client'

import { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import Link from 'next/link'
import { 
  Clock, 
  NotebookPen, 
  Bot, 
  HardDrive, 
  BriefcaseBusiness, 
  WandSparkles,
  Settings, 
  Calendar, 
  CheckSquare, 
  FileText, 
  Plus, 
  Trash2, 
  Check 
} from 'lucide-react'

type CalendarEvent = {
  id: string
  summary: string
  start?: string
  end?: string
  allDay: boolean
}

type Todo = {
  id: string
  text: string
  done: boolean
}

export default function DashboardPage() {
  const { data: session, status } = useSession()
  const [currentTime, setCurrentTime] = useState(new Date())
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [eventsLoading, setEventsLoading] = useState(true)
  const [todos, setTodos] = useState<Todo[]>([])
  const [newTodo, setNewTodo] = useState('')
  const [memo, setMemo] = useState('')

  useEffect(() => {
    if (status === 'unauthenticated') {
      window.location.href = '/api/auth/signin'
    }
  }, [status])

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date())
    }, 1000)
    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
    fetch('/api/calendar/today')
      .then(r => r.json())
      .then(d => setEvents(d.events || []))
      .catch(() => setEvents([]))
      .finally(() => setEventsLoading(false))
  }, [])

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const savedTodos = localStorage.getItem('dashboard-todos')
      if (savedTodos) {
        try {
          setTodos(JSON.parse(savedTodos))
        } catch {
          setTodos([])
        }
      }
      const savedMemo = localStorage.getItem('dashboard-memo')
      if (savedMemo) {
        setMemo(savedMemo)
      }
    }
  }, [])

  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('dashboard-todos', JSON.stringify(todos))
    }
  }, [todos])

  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('dashboard-memo', memo)
    }
  }, [memo])

  const addTodo = () => {
    if (!newTodo.trim()) return
    const todo: Todo = {
      id: Date.now().toString(),
      text: newTodo.trim(),
      done: false
    }
    setTodos([...todos, todo])
    setNewTodo('')
  }

  const toggleTodo = (id: string) => {
    setTodos(todos.map(t => t.id === id ? { ...t, done: !t.done } : t))
  }

  const deleteTodo = (id: string) => {
    setTodos(todos.filter(t => t.id !== id))
  }

  const getGreeting = () => {
    const hour = currentTime.getHours()
    if (hour < 12) return '좋은 아침'
    if (hour < 18) return '좋은 오후'
    return '좋은 저녁'
  }

  const formatTime = (date: Date) => {
    const h = date.getHours().toString().padStart(2, '0')
    const m = date.getMinutes().toString().padStart(2, '0')
    const s = date.getSeconds().toString().padStart(2, '0')
    return `${h}:${m}:${s}`
  }

  const formatDate = (date: Date) => {
    const year = date.getFullYear()
    const month = date.getMonth() + 1
    const day = date.getDate()
    const weekdays = ['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일']
    const weekday = weekdays[date.getDay()]
    return `${year}년 ${month}월 ${day}일 ${weekday}`
  }

  if (status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="w-12 h-12 border-4 border-black border-t-[#FFE500] rounded-full animate-spin" />
      </div>
    )
  }

  if (!session) {
    return null
  }

  const quickLinks = [
    { href: '/dashboard/notes', label: 'Notes', icon: NotebookPen },
    { href: '/dashboard/ai', label: 'AI Chat', icon: Bot },
    { href: '/dashboard/drive', label: 'Google Drive', icon: HardDrive },
    { href: '/dashboard/jobs', label: 'Jobs', icon: BriefcaseBusiness },
    { href: '/dashboard/skills', label: 'Skills', icon: WandSparkles },
    { href: '/dashboard/settings', label: '설정', icon: Settings },
  ]

  return (
    <div className="min-h-screen bg-white p-4 md:p-8">
      <div className="max-w-6xl mx-auto">
        <header className="mb-8">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
            <h1 className="text-3xl md:text-4xl font-black tracking-tight">MY DASHBOARD</h1>
            <p className="text-xl md:text-2xl font-bold text-[#FFE500] bg-black px-4 py-2 border-4 border-black shadow-[4px_4px_0_black]">
              {getGreeting()}
            </p>
          </div>
        </header>

        <main className="space-y-6">
          <div className="bg-[#FFE500] border-4 border-black shadow-[4px_4px_0_black] p-6">
            <div className="flex items-center gap-3 mb-4">
              <Clock className="w-6 h-6" />
              <h2 className="text-xl font-black uppercase">Live Clock</h2>
            </div>
            <div className="text-5xl md:text-7xl font-black font-mono tracking-tighter">
              {formatTime(currentTime)}
            </div>
            <div className="text-lg md:text-xl font-bold mt-2">
              {formatDate(currentTime)}
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white border-4 border-black shadow-[4px_4px_0_black] p-6">
              <div className="flex items-center gap-3 mb-4">
                <HardDrive className="w-6 h-6" />
                <h2 className="text-xl font-black uppercase">Quick Links</h2>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {quickLinks.map(link => (
                  <Link
                    key={link.href}
                    href={link.href}
                    className="flex flex-col items-center justify-center gap-2 p-4 border-4 border-black bg-white hover:bg-[#FFE500] hover:shadow-[4px_4px_0_black] transition-all duration-150 group"
                  >
                    <link.icon className="w-8 h-8 group-hover:scale-110 transition-transform" />
                    <span className="font-black text-sm">{link.label}</span>
                  </Link>
                ))}
              </div>
            </div>

            <div className="bg-white border-4 border-black shadow-[4px_4px_0_black] p-6">
              <div className="flex items-center gap-3 mb-4">
                <Calendar className="w-6 h-6" />
                <h2 className="text-xl font-black uppercase">Today's Events</h2>
              </div>
              {eventsLoading ? (
                <div className="flex items-center justify-center h-32">
                  <div className="w-10 h-10 border-4 border-black border-t-[#FFE500] rounded-full animate-spin" />
                </div>
              ) : events.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-32 text-gray-500">
                  <Calendar className="w-12 h-12 mb-2 opacity-50" />
                  <p className="font-bold">일정 없음</p>
                </div>
              ) : (
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {events.map(event => (
                    <div
                      key={event.id}
                      className="flex items-center gap-3 p-3 border-4 border-black bg-gray-50"
                    >
                      <div className="w-2 h-2 bg-[#FFE500] border-2 border-black rounded-full" />
                      <div className="flex-1 min-w-0">
                        <p className="font-bold truncate">{event.summary}</p>
                        {!event.allDay && event.start && (
                          <p className="text-sm text-gray-600">
                            {new Date(event.start).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}
                            {event.end && ` - ${new Date(event.end).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}`}
                          </p>
                        )}
                        {event.allDay && (
                          <p className="text-sm text-gray-500">종일</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white border-4 border-black shadow-[4px_4px_0_black] p-6">
              <div className="flex items-center gap-3 mb-4">
                <CheckSquare className="w-6 h-6" />
                <h2 className="text-xl font-black uppercase">Todo List</h2>
              </div>
              <div className="flex gap-2 mb-4">
                <input
                  type="text"
                  value={newTodo}
                  onChange={e => setNewTodo(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') addTodo()
                  }}
                  placeholder="새 할 일 입력..."
                  className="flex-1 px-4 py-3 border-4 border-black font-medium focus:outline-none focus:shadow-[4px_4px_0_black]"
                />
                <button
                  onClick={addTodo}
                  className="px-4 py-3 bg-[#FFE500] border-4 border-black font-black hover:shadow-[4px_4px_0_black] hover:translate-x-[-2px] hover:translate-y-[-2px] transition-all"
                >
                  <Plus className="w-6 h-6" />
                </button>
              </div>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {todos.length === 0 ? (
                  <p className="text-center text-gray-500 py-8 font-bold">할 일이 없습니다</p>
                ) : (
                  todos.map(todo => (
                    <div
                      key={todo.id}
                      className="flex items-center gap-3 p-3 border-4 border-black bg-white hover:shadow-[4px_4px_0_black] transition-all"
                    >
                      <button
                        onClick={() => toggleTodo(todo.id)}
                        className={`w-8 h-8 border-4 border-black flex items-center justify-center transition-all ${
                          todo.done 
                            ? 'bg-[#FFE500] translate-y-[-2px] shadow-[2px_2px_0_black]' 
                            : 'bg-white hover:bg-gray-100'
                        }`}
                      >
                        {todo.done && <Check className="w-5 h-5 font-black" />}
                      </button>
                      <span className={`flex-1 font-medium ${todo.done ? 'line-through text-gray-400' : ''}`}>
                        {todo.text}
                      </span>
                      <button
                        onClick={() => deleteTodo(todo.id)}
                        className="p-2 hover:bg-red-100 transition-colors"
                      >
                        <Trash2 className="w-5 h-5" />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="bg-white border-4 border-black shadow-[4px_4px_0_black] p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <FileText className="w-6 h-6" />
                  <h2 className="text-xl font-black uppercase">Quick Memo</h2>
                </div>
                <span className="text-sm font-bold text-gray-500">{memo.length}자</span>
              </div>
              <textarea
                value={memo}
                onChange={e => setMemo(e.target.value)}
                placeholder="빠른 메모를 입력하세요..."
                className="w-full h-48 px-4 py-3 border-4 border-black font-medium focus:outline-none focus:shadow-[4px_4px_0_black] resize-none"
              />
              <p className="text-xs text-gray-500 mt-2 font-medium">입력 시 자동으로 저장됩니다</p>
            </div>
          </div>
        </main>
      </div>
    </div>
  )
}