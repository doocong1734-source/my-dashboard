'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { Bot, X, Trash2, Send, StopCircle, Loader2, Sparkles } from 'lucide-react'
import MarkdownRenderer from '@/components/MarkdownRenderer'

interface Message {
  role: 'user' | 'assistant'
  content: string
}

interface NoteAIPanelProps {
  isOpen: boolean
  onClose: () => void
  onOpen: () => void
  noteTitle: string
  noteContent: string
  noteFileId: string | null
}

const SYSTEM_PROMPT = '당신은 노트 작성을 도와주는 AI 어시스턴트입니다. 한국어로 답변하세요.'

export default function NoteAIPanel({
  isOpen,
  onClose,
  onOpen,
  noteTitle,
  noteContent,
  noteFileId,
}: NoteAIPanelProps) {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [isStreaming, setIsStreaming] = useState(false)
  const [streamingText, setStreamingText] = useState('')
  const [isFirstMessage, setIsFirstMessage] = useState(true)
  const abortControllerRef = useRef<AbortController | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (noteFileId) {
      const saved = localStorage.getItem(`ai-panel-${noteFileId}`)
      if (saved) {
        try {
          setMessages(JSON.parse(saved))
          setIsFirstMessage(false)
        } catch {}
      }
    }
  }, [noteFileId])

  useEffect(() => {
    if (noteFileId && messages.length > 0) {
      localStorage.setItem(`ai-panel-${noteFileId}`, JSON.stringify(messages))
    }
  }, [messages, noteFileId])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, streamingText])

  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus()
    }
  }, [isOpen])

  const handleStop = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
      setIsStreaming(false)
      setStreamingText('')
    }
  }, [])

  const handleSend = useCallback(async () => {
    if (!input.trim() || isStreaming) return

    const userMessage = input.trim()
    setInput('')
    setIsStreaming(true)
    setStreamingText('')

    let contextMessage = ''
    if (isFirstMessage) {
      contextMessage = `[현재 노트: ${noteTitle}]\n${noteContent}\n---\n${userMessage}`
      setIsFirstMessage(false)
    } else {
      contextMessage = userMessage
    }

    const updatedMessages = [...messages, { role: 'user' as const, content: userMessage }]
    setMessages(updatedMessages)

    const conversationMessages = updatedMessages.map((m) => ({
      role: m.role,
      content: m.content,
    }))

    abortControllerRef.current = new AbortController()

    try {
      const response = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            ...conversationMessages,
          ],
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
        const lines = chunk.split('\n')

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const data = line.slice(6).trim()
          if (data === '[DONE]') continue
          try {
            const parsed = JSON.parse(data)
            if (parsed.type === 'content_block_delta' && parsed.delta?.text) {
              accumulated += parsed.delta.text
              setStreamingText(accumulated)
            }
          } catch {}
        }
      }

      setMessages((prev) => [...prev, { role: 'assistant', content: accumulated }])
    } catch (error: any) {
      if (error.name !== 'AbortError') {
        setMessages((prev) => [
          ...prev,
          { role: 'assistant', content: '죄송합니다. 오류가 발생했습니다.' },
        ])
      }
    } finally {
      setIsStreaming(false)
      setStreamingText('')
    }
  }, [input, isStreaming, isFirstMessage, noteTitle, noteContent, messages])

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

  const handleClear = () => {
    setMessages([])
    setStreamingText('')
    setIsFirstMessage(true)
    if (noteFileId) {
      localStorage.removeItem(`ai-panel-${noteFileId}`)
    }
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
      <div className="flex items-center justify-between border-b-4 border-black bg-yellow-400 p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-black text-white">
            <Bot className="h-6 w-6" />
          </div>
          <div>
            <h2 className="text-lg font-black tracking-tight text-black">AI ASSISTANT</h2>
            <span className="text-xs font-bold text-black/60">MiniMax M2.7</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleClear}
            className="rounded bg-white p-2 shadow-[2px_2px_0_black] transition-all hover:shadow-[3px_3px_0_black] hover:-translate-x-[1px] hover:-translate-y-[1px] border-2 border-black"
          >
            <Trash2 className="h-4 w-4 text-black" />
          </button>
          <button
            onClick={onClose}
            className="rounded bg-white p-2 shadow-[2px_2px_0_black] transition-all hover:shadow-[3px_3px_0_black] hover:-translate-x-[1px] hover:-translate-y-[1px] border-2 border-black"
          >
            <X className="h-4 w-4 text-black" />
          </button>
        </div>
      </div>

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
            <p className="text-sm text-black/60">
              현재 노트 내용을 바탕으로 AI가 도움을 드립니다.
            </p>
          </div>
        )}

        {messages.map((msg, idx) => (
          <div
            key={idx}
            className={`mb-4 flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[85%] rounded-lg p-3 ${
                msg.role === 'user'
                  ? 'bg-yellow-400 text-black border-2 border-black shadow-[3px_3px_0_black]'
                  : 'bg-white text-black border-2 border-black shadow-[3px_3px_0_black]'
              }`}
            >
              {msg.role === 'assistant' ? (
                <div className="prose-sm max-w-none">
                  <MarkdownRenderer content={msg.content} />
                </div>
              ) : (
                <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
              )}
            </div>
          </div>
        ))}

        {isStreaming && streamingText && (
          <div className="mb-4 flex justify-start">
            <div className="max-w-[85%] rounded-lg bg-white p-3 border-2 border-black shadow-[3px_3px_0_black]">
              <div className="prose-sm max-w-none">
                <MarkdownRenderer content={streamingText + '▊'} />
              </div>
            </div>
          </div>
        )}

        {isStreaming && !streamingText && (
          <div className="mb-4 flex justify-start">
            <div className="flex items-center gap-2 rounded-lg bg-white p-3 border-2 border-black shadow-[3px_3px_0_black]">
              <Loader2 className="h-4 w-4 animate-spin text-black" />
              <span className="text-sm font-medium text-black">생각 중...</span>
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
    </div>
  )
}