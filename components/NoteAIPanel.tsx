'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { Bot, X, Trash2, Send, StopCircle, Loader2, Sparkles, Plus, History, ChevronLeft } from 'lucide-react'
import MarkdownRenderer from '@/components/MarkdownRenderer'

interface Message {
  role: 'user' | 'assistant'
  content: string
}

interface Conversation {
  id: string
  title: string
  createdAt: number
  messages: Message[]
}

interface NoteAIPanelProps {
  isOpen: boolean
  onClose: () => void
  onOpen: () => void
  noteTitle: string
  noteContent: string
  noteFileId: string | null
  vaultFolderId?: string | null
}

const SYSTEM_PROMPT =
  '당신은 카파시 방식의 LLM 위키 에이전트입니다. 사용자의 Google Drive 볼트를 세컨드 브레인으로 관리합니다. ' +
  '사용 가능한 도구: list_vault_structure(폴더 구조 탐색), list_notes(노트 목록), search_notes(키워드 검색), ' +
  'get_note_content(노트 읽기), create_folder(폴더 생성), create_or_update_note(노트 생성/수정). ' +
  '볼트에 raw/, wiki/, index.md, log.md, claude.md 구조를 권장합니다. ' +
  '한국어로 답변하세요.'

function genId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2)
}

function loadConversations(noteFileId: string): Conversation[] {
  try {
    const saved = localStorage.getItem(`ai-convs-${noteFileId}`)
    return saved ? JSON.parse(saved) : []
  } catch {
    return []
  }
}

function saveConversations(noteFileId: string, convs: Conversation[]) {
  localStorage.setItem(`ai-convs-${noteFileId}`, JSON.stringify(convs))
}

function loadActiveId(noteFileId: string): string | null {
  return localStorage.getItem(`ai-active-${noteFileId}`)
}

function saveActiveId(noteFileId: string, id: string | null) {
  if (id) localStorage.setItem(`ai-active-${noteFileId}`, id)
  else localStorage.removeItem(`ai-active-${noteFileId}`)
}

export default function NoteAIPanel({
  isOpen,
  onClose,
  onOpen,
  noteTitle,
  noteContent,
  noteFileId,
  vaultFolderId,
}: NoteAIPanelProps) {
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [isStreaming, setIsStreaming] = useState(false)
  const [streamingText, setStreamingText] = useState('')
  const [toolStatus, setToolStatus] = useState('')
  const [isFirstMessage, setIsFirstMessage] = useState(true)
  const [view, setView] = useState<'chat' | 'history'>('chat')
  const abortControllerRef = useRef<AbortController | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  // Load conversations when noteFileId changes
  useEffect(() => {
    if (!noteFileId) return
    const convs = loadConversations(noteFileId)
    setConversations(convs)
    const aid = loadActiveId(noteFileId)
    if (aid && convs.find((c) => c.id === aid)) {
      const conv = convs.find((c) => c.id === aid)!
      setActiveId(aid)
      setMessages(conv.messages)
      setIsFirstMessage(conv.messages.length === 0)
    } else if (convs.length > 0) {
      const latest = convs[0]
      setActiveId(latest.id)
      setMessages(latest.messages)
      setIsFirstMessage(latest.messages.length === 0)
    } else {
      setActiveId(null)
      setMessages([])
      setIsFirstMessage(true)
    }
  }, [noteFileId])

  // Save messages to active conversation
  useEffect(() => {
    if (!noteFileId || !activeId || messages.length === 0) return
    const convs = loadConversations(noteFileId)
    const idx = convs.findIndex((c) => c.id === activeId)
    if (idx >= 0) {
      convs[idx].messages = messages
    } else {
      const title = messages.find((m) => m.role === 'user')?.content.slice(0, 40) || '새 대화'
      convs.unshift({ id: activeId, title, createdAt: Date.now(), messages })
    }
    saveConversations(noteFileId, convs)
    setConversations(loadConversations(noteFileId))
  }, [messages, noteFileId, activeId])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, streamingText])

  useEffect(() => {
    if (isOpen && view === 'chat' && inputRef.current) {
      inputRef.current.focus()
    }
  }, [isOpen, view])

  const startNewConversation = useCallback(() => {
    const id = genId()
    setActiveId(id)
    setMessages([])
    setInput('')
    setIsFirstMessage(true)
    setStreamingText('')
    setToolStatus('')
    setView('chat')
    if (noteFileId) saveActiveId(noteFileId, id)
  }, [noteFileId])

  const loadConversation = useCallback(
    (conv: Conversation) => {
      setActiveId(conv.id)
      setMessages(conv.messages)
      setIsFirstMessage(conv.messages.length === 0)
      setStreamingText('')
      setToolStatus('')
      setView('chat')
      if (noteFileId) saveActiveId(noteFileId, conv.id)
    },
    [noteFileId]
  )

  const deleteConversation = useCallback(
    (id: string) => {
      if (!noteFileId) return
      const convs = loadConversations(noteFileId).filter((c) => c.id !== id)
      saveConversations(noteFileId, convs)
      setConversations(convs)
      if (id === activeId) {
        if (convs.length > 0) {
          loadConversation(convs[0])
        } else {
          setActiveId(null)
          setMessages([])
          setIsFirstMessage(true)
        }
      }
    },
    [noteFileId, activeId, loadConversation]
  )

  const handleStop = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
      setIsStreaming(false)
      setStreamingText('')
      setToolStatus('')
    }
  }, [])

  const handleSend = useCallback(async () => {
    if (!input.trim() || isStreaming) return

    const userMessage = input.trim()
    setInput('')
    setIsStreaming(true)
    setStreamingText('')
    setToolStatus('')

    if (isFirstMessage) {
      setIsFirstMessage(false)
    }

    // Create conversation if none active
    let cid = activeId
    if (!cid) {
      cid = genId()
      setActiveId(cid)
      if (noteFileId) saveActiveId(noteFileId, cid)
    }

    // Update title if this is the first user message
    const isNewConv = messages.length === 0
    const updatedMessages = [...messages, { role: 'user' as const, content: userMessage }]
    setMessages(updatedMessages)

    if (isNewConv && noteFileId) {
      const convs = loadConversations(noteFileId)
      const existing = convs.findIndex((c) => c.id === cid)
      if (existing < 0) {
        convs.unshift({ id: cid!, title: userMessage.slice(0, 40), createdAt: Date.now(), messages: updatedMessages })
      } else {
        convs[existing].title = userMessage.slice(0, 40)
      }
      saveConversations(noteFileId, convs)
      setConversations(loadConversations(noteFileId))
    }

    // Build conversation for API (first message injects note context)
    const apiMessages = updatedMessages.map((m, i) =>
      i === 0 && m.role === 'user' && isNewConv
        ? { role: 'user', content: `[현재 노트: ${noteTitle}]\n${noteContent}\n---\n${m.content}` }
        : { role: m.role, content: m.content }
    )

    abortControllerRef.current = new AbortController()

    try {
      const response = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [{ role: 'system', content: SYSTEM_PROMPT }, ...apiMessages],
          vaultFolderId: vaultFolderId ?? null,
        }),
        signal: abortControllerRef.current.signal,
      })

      if (!response.ok) throw new Error('Network response was not ok')
      if (!response.body) throw new Error('No response body')

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let accumulated = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        const chunk = decoder.decode(value, { stream: true })
        for (const line of chunk.split('\n')) {
          if (!line.startsWith('data: ')) continue
          const data = line.slice(6).trim()
          if (data === '[DONE]') continue
          try {
            const parsed = JSON.parse(data)
            if (parsed.type === 'content_block_delta' && parsed.delta?.text) {
              accumulated += parsed.delta.text
              setStreamingText(accumulated)
              setToolStatus('')
            } else if (parsed.type === 'tool_status' && parsed.text) {
              setToolStatus(parsed.text)
            }
          } catch {}
        }
      }

      setMessages((prev) => [...prev, { role: 'assistant', content: accumulated }])
    } catch (error: unknown) {
      if (error instanceof Error && error.name !== 'AbortError') {
        setMessages((prev) => [...prev, { role: 'assistant', content: '죄송합니다. 오류가 발생했습니다.' }])
      }
    } finally {
      setIsStreaming(false)
      setStreamingText('')
      setToolStatus('')
    }
  }, [input, isStreaming, isFirstMessage, noteTitle, noteContent, messages, vaultFolderId, activeId, noteFileId])

  const quickActions = [
    { label: '요약', prompt: '이 노트를 3-5개의 핵심 포인트로 요약해줘' },
    { label: '아이디어', prompt: '이 노트 내용을 바탕으로 관련 아이디어를 5개 제안해줘' },
    { label: '질문', prompt: '이 노트의 내용으로 이해도를 테스트할 수 있는 질문 5개를 만들어줘' },
  ]

  const handleQuickAction = (prompt: string) => {
    setInput(prompt)
    setIsFirstMessage(false)
    inputRef.current?.focus()
  }

  if (!isOpen) {
    return (
      <button
        onClick={onOpen}
        className="fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-yellow-400 p-0 shadow-[4px_4px_0_black] transition-all hover:shadow-[6px_6px_0_black] hover:-translate-x-[2px] hover:-translate-y-[2px] border-2 border-black"
      >
        <Bot className="h-7 w-7 text-black" />
      </button>
    )
  }

  return (
    <div className="fixed inset-y-0 right-0 z-50 flex h-screen w-[380px] flex-col border-l-4 border-black bg-white shadow-[8px_0_0_black]">
      {/* Header */}
      <div className="flex items-center justify-between border-b-4 border-black bg-yellow-400 p-4">
        <div className="flex items-center gap-3">
          {view === 'history' ? (
            <button
              onClick={() => setView('chat')}
              className="flex h-10 w-10 items-center justify-center rounded-full bg-black text-white"
            >
              <ChevronLeft className="h-6 w-6" />
            </button>
          ) : (
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-black text-white">
              <Bot className="h-6 w-6" />
            </div>
          )}
          <div>
            <h2 className="text-lg font-black tracking-tight text-black">
              {view === 'history' ? '대화 기록' : 'AI ASSISTANT'}
            </h2>
            <span className="text-xs font-bold text-black/60">MiniMax M2.7</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={startNewConversation}
            title="새 대화"
            className="rounded bg-white p-2 shadow-[2px_2px_0_black] transition-all hover:shadow-[3px_3px_0_black] hover:-translate-x-[1px] hover:-translate-y-[1px] border-2 border-black"
          >
            <Plus className="h-4 w-4 text-black" />
          </button>
          <button
            onClick={() => setView(view === 'history' ? 'chat' : 'history')}
            title="대화 기록"
            className="rounded bg-white p-2 shadow-[2px_2px_0_black] transition-all hover:shadow-[3px_3px_0_black] hover:-translate-x-[1px] hover:-translate-y-[1px] border-2 border-black"
          >
            <History className="h-4 w-4 text-black" />
          </button>
          <button
            onClick={onClose}
            className="rounded bg-white p-2 shadow-[2px_2px_0_black] transition-all hover:shadow-[3px_3px_0_black] hover:-translate-x-[1px] hover:-translate-y-[1px] border-2 border-black"
          >
            <X className="h-4 w-4 text-black" />
          </button>
        </div>
      </div>

      {/* History View */}
      {view === 'history' && (
        <div className="flex-1 overflow-y-auto p-4">
          {conversations.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center text-center">
              <History className="mb-3 h-12 w-12 text-black/30" />
              <p className="text-sm text-black/50">저장된 대화가 없어요</p>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {conversations.map((conv) => (
                <div
                  key={conv.id}
                  className={`flex items-center gap-2 rounded-lg border-2 p-3 cursor-pointer transition-all ${
                    conv.id === activeId
                      ? 'border-black bg-yellow-400 shadow-[3px_3px_0_black]'
                      : 'border-black bg-white hover:bg-yellow-50 shadow-[2px_2px_0_black]'
                  }`}
                  onClick={() => loadConversation(conv)}
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-black truncate">{conv.title}</p>
                    <p className="text-xs text-black/50">
                      {new Date(conv.createdAt).toLocaleDateString('ko-KR', {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                      {' · '}{conv.messages.length}개 메시지
                    </p>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      deleteConversation(conv.id)
                    }}
                    className="flex-shrink-0 rounded p-1.5 hover:bg-red-100 border border-transparent hover:border-red-400 transition-all"
                  >
                    <Trash2 className="h-3.5 w-3.5 text-black/50 hover:text-red-500" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Chat View */}
      {view === 'chat' && (
        <>
          <div className="flex flex-wrap gap-2 border-b-4 border-black bg-black/5 p-3">
            {quickActions.map((action) => (
              <button
                key={action.label}
                onClick={() => handleQuickAction(action.prompt)}
                disabled={isStreaming}
                className="flex items-center gap-1.5 rounded bg-yellow-400 px-3 py-1.5 text-xs font-black text-black transition-all hover:bg-yellow-500 disabled:cursor-not-allowed disabled:opacity-50 border-2 border-black shadow-[2px_2px_0_black] hover:shadow-[3px_3px_0_black] hover:-translate-x-[1px] hover:-translate-y-[1px]"
              >
                <Sparkles className="h-3 w-3" />
                {action.label}
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-y-auto p-4">
            {messages.length === 0 && !isStreaming && (
              <div className="flex h-full flex-col items-center justify-center text-center">
                <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-yellow-400 shadow-[4px_4px_0_black] border-2 border-black">
                  <Bot className="h-8 w-8 text-black" />
                </div>
                <h3 className="mb-2 text-lg font-black text-black">노트에 대해 물어보세요</h3>
                <p className="text-sm text-black/60">노트 검색, 내용 분석, 아이디어 제안까지</p>
              </div>
            )}

            {messages.map((msg, idx) => (
              <div key={idx} className={`mb-4 flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[85%] min-w-0 overflow-hidden rounded-lg p-3 ${
                    msg.role === 'user'
                      ? 'bg-yellow-400 text-black border-2 border-black shadow-[3px_3px_0_black]'
                      : 'bg-white text-black border-2 border-black shadow-[3px_3px_0_black]'
                  }`}
                >
                  {msg.role === 'assistant' ? (
                    <div className="prose-sm max-w-none break-words">
                      <MarkdownRenderer content={msg.content} />
                    </div>
                  ) : (
                    <p className="text-sm whitespace-pre-wrap break-words">{msg.content}</p>
                  )}
                </div>
              </div>
            ))}

            {isStreaming && streamingText && (
              <div className="mb-4 flex justify-start">
                <div className="max-w-[85%] min-w-0 overflow-hidden rounded-lg bg-white p-3 border-2 border-black shadow-[3px_3px_0_black]">
                  <div className="prose-sm max-w-none break-words">
                    <MarkdownRenderer content={streamingText + '▊'} />
                  </div>
                </div>
              </div>
            )}

            {isStreaming && !streamingText && (
              <div className="mb-4 flex justify-start">
                <div className="flex items-center gap-2 rounded-lg bg-white p-3 border-2 border-black shadow-[3px_3px_0_black]">
                  <Loader2 className="h-4 w-4 animate-spin text-black" />
                  <span className="text-sm font-medium text-black">{toolStatus || '생각 중...'}</span>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          <div className="flex gap-2 border-t-4 border-black p-3 bg-white">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => {
                setInput(e.target.value)
                setIsFirstMessage(false)
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  handleSend()
                }
              }}
              placeholder="메시지를 입력하세요..."
              className="flex-1 resize-none border-2 border-black bg-white p-3 text-sm outline-none focus:border-yellow-400"
              rows={2}
            />
            <div className="flex flex-col gap-2">
              {isStreaming ? (
                <button
                  onClick={handleStop}
                  className="flex h-11 w-11 items-center justify-center rounded bg-red-500 text-white shadow-[2px_2px_0_black] transition-all hover:shadow-[3px_3px_0_black] hover:-translate-x-[1px] hover:-translate-y-[1px] border-2 border-black"
                >
                  <StopCircle className="h-5 w-5" />
                </button>
              ) : (
                <button
                  onClick={handleSend}
                  disabled={!input.trim()}
                  className="flex h-11 w-11 items-center justify-center rounded bg-yellow-400 text-black shadow-[2px_2px_0_black] transition-all hover:shadow-[3px_3px_0_black] hover:-translate-x-[1px] hover:-translate-y-[1px] disabled:cursor-not-allowed disabled:opacity-50 border-2 border-black"
                >
                  <Send className="h-5 w-5" />
                </button>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
