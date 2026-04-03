'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useSession } from 'next-auth/react'
import MarkdownRenderer from '@/components/MarkdownRenderer'

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
}

interface ChatSession {
  id: string
  name: string
  modifiedTime?: string
}

const SYSTEM_PRESETS = {
  일반: 'You are a helpful AI assistant. Respond in Korean unless asked otherwise.',
  코딩: 'You are an expert programming assistant. Provide clean, well-commented code. Respond in Korean.',
  글쓰기: 'You are a skilled writer. Help with creative writing, essays, and content creation in Korean.',
  번역: 'You are a professional translator. Provide accurate translations while preserving meaning and tone.',
  분석: 'You are a data analysis expert. Provide clear insights and structured analysis in Korean.'
}

export default function AIChatPage() {
  const { data: session } = useSession()
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [selectedPreset, setSelectedPreset] = useState<keyof typeof SYSTEM_PRESETS>('일반')
  const [abortController, setAbortController] = useState<AbortController | null>(null)
  const [streamingContent, setStreamingContent] = useState('')
  const [isTyping, setIsTyping] = useState(false)
  const [sessions, setSessions] = useState<ChatSession[]>([])
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null)
  const [sessionsLoading, setSessionsLoading] = useState(false)
  const [vaultFolderId, setVaultFolderId] = useState<string | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const saved = localStorage.getItem('vault-folder-id')
    if (saved) setVaultFolderId(saved)
  }, [])

  const loadSessions = useCallback(async () => {
    if (!vaultFolderId) return
    setSessionsLoading(true)
    try {
      const res = await fetch(`/api/ai/sessions?vaultFolderId=${vaultFolderId}`)
      const data = await res.json()
      setSessions(data.sessions || [])
    } finally {
      setSessionsLoading(false)
    }
  }, [vaultFolderId])

  useEffect(() => {
    if (vaultFolderId) {
      loadSessions()
    }
  }, [vaultFolderId, loadSessions])

  const saveSession = async (msgs: Message[]) => {
    if (!vaultFolderId || msgs.length === 0) return
    const title = msgs[0].content.slice(0, 30)
    try {
      const res = await fetch('/api/ai/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vaultFolderId, sessionId: currentSessionId || undefined, title, messages: msgs })
      })
      const data = await res.json()
      if (data.sessionId) {
        setCurrentSessionId(data.sessionId)
        loadSessions()
      }
    } catch (error) {
      console.error('Failed to save session:', error)
    }
  }

  const loadSession = async (sessionId: string) => {
    try {
      const res = await fetch(`/api/ai/sessions?sessionId=${sessionId}`)
      const data = await res.json()
      if (data.messages) {
        setMessages(data.messages)
        setCurrentSessionId(sessionId)
      }
    } catch (error) {
      console.error('Failed to load session:', error)
    }
  }

  const deleteSession = async (e: React.MouseEvent, sessionId: string) => {
    e.stopPropagation()
    if (!vaultFolderId) return
    try {
      await fetch('/api/ai/sessions', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vaultFolderId, sessionId })
      })
      if (currentSessionId === sessionId) {
        setCurrentSessionId(null)
        setMessages([])
      }
      loadSessions()
    } catch (error) {
      console.error('Failed to delete session:', error)
    }
  }

  const startNewChat = () => {
    setMessages([])
    setCurrentSessionId(null)
    setInput('')
  }

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages, streamingContent])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!input.trim() || isLoading) return

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input.trim()
    }

    const newMessages = [...messages, userMessage]
    setMessages(newMessages)
    setInput('')
    setIsLoading(true)
    setIsTyping(true)
    setStreamingContent('')

    const controller = new AbortController()
    setAbortController(controller)

    try {
      const response = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: newMessages,
          systemPrompt: SYSTEM_PRESETS[selectedPreset]
        }),
        signal: controller.signal
      })

      if (!response.ok) throw new Error('Failed to get response')

      const reader = response.body?.getReader()
      const decoder = new TextDecoder()
      let fullContent = ''
      let buffer = ''

      while (true) {
        const { done, value } = await reader!.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6)
            if (data === '[DONE]') continue

            try {
              const parsed = JSON.parse(data)
              if (parsed.type === 'content_block_delta' && parsed.delta?.text) {
                fullContent += parsed.delta.text
                setStreamingContent(fullContent)
              } else if (parsed.content || parsed.text) {
                const text = parsed.content || parsed.text
                fullContent += text
                setStreamingContent(fullContent)
              }
            } catch {
              fullContent += data
              setStreamingContent(fullContent)
            }
          }
        }
      }

      if (buffer) {
        if (buffer.startsWith('data: ')) {
          const data = buffer.slice(6)
          if (data !== '[DONE]') {
            try {
              const parsed = JSON.parse(data)
              if (parsed.type === 'content_block_delta' && parsed.delta?.text) {
                fullContent += parsed.delta.text
              } else if (parsed.content || parsed.text) {
                fullContent += parsed.content || parsed.text
              }
            } catch {
              fullContent += data
            }
          }
        } else {
          fullContent += buffer
        }
      }

      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: fullContent
      }

      const finalMessages = [...newMessages, assistantMessage]
      setMessages(finalMessages)
      await saveSession(finalMessages)
    } catch (error) {
      if ((error as Error).name !== 'AbortError') {
        console.error('Error:', error)
      }
    } finally {
      setIsLoading(false)
      setIsTyping(false)
      setStreamingContent('')
      setAbortController(null)
    }
  }

  const stopGeneration = () => {
    abortController?.abort()
    if (streamingContent) {
      const assistantMessage: Message = {
        id: Date.now().toString(),
        role: 'assistant',
        content: streamingContent
      }
      const finalMessages = [...messages, assistantMessage]
      setMessages(finalMessages)
      saveSession(finalMessages)
    }
    setStreamingContent('')
    setIsLoading(false)
    setIsTyping(false)
  }

  const copyMessage = (content: string) => {
    navigator.clipboard.writeText(content)
  }

  const clearChat = () => {
    setMessages([])
    setStreamingContent('')
    setCurrentSessionId(null)
  }

  return (
    <div className="flex h-screen bg-white">
      <div className="w-60 border-r-4 border-black bg-gray-50 flex flex-col">
        <div className="p-4 border-b-4 border-black flex items-center justify-between">
          <h2 className="font-bold text-lg">SESSIONS</h2>
          <button
            onClick={startNewChat}
            className="px-3 py-1 bg-[#FFE500] border-2 border-black font-bold text-sm hover:bg-yellow-300 transition-colors"
          >
            + 새 대화
          </button>
        </div>
        
        <div className="flex-1 overflow-y-auto">
          {sessionsLoading ? (
            <div className="p-4 text-center text-gray-500">Loading...</div>
          ) : sessions.length === 0 ? (
            <div className="p-4 text-center text-gray-400">No sessions yet</div>
          ) : (
            sessions.map((s) => (
              <div
                key={s.id}
                onClick={() => loadSession(s.id)}
                className={`p-3 border-b-2 border-gray-200 cursor-pointer hover:bg-yellow-50 transition-colors relative group ${
                  currentSessionId === s.id ? 'bg-[#FFE500]' : ''
                }`}
              >
                <div className="font-medium text-sm pr-8 truncate">{s.name}</div>
                {s.modifiedTime && (
                  <div className="text-xs text-gray-400 mt-1">
                    {new Date(s.modifiedTime).toLocaleDateString()}
                  </div>
                )}
                <button
                  onClick={(e) => deleteSession(e, s.id)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-500 transition-opacity w-6 h-6 flex items-center justify-center"
                >
                  ✕
                </button>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="flex-1 flex flex-col">
        <div className="p-4 border-b-2 border-gray-200 flex gap-2 flex-wrap">
          {(Object.keys(SYSTEM_PRESETS) as Array<keyof typeof SYSTEM_PRESETS>).map((preset) => (
            <button
              key={preset}
              onClick={() => setSelectedPreset(preset)}
              className={`px-4 py-2 border-2 border-black font-medium transition-all ${
                selectedPreset === preset
                  ? 'bg-black text-white'
                  : 'bg-white hover:bg-gray-100'
              }`}
            >
              {preset}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.map((message) => (
            <div
              key={message.id}
              className={`p-4 rounded-lg border-2 border-black ${
                message.role === 'user'
                  ? 'bg-blue-50 ml-12'
                  : 'bg-white mr-12'
              }`}
            >
              <div className="font-bold mb-2">
                {message.role === 'user' ? 'You' : 'Assistant'}
              </div>
              <MarkdownRenderer content={message.content} />
              
              {message.role === 'assistant' && (
                <div className="flex gap-2 mt-3 pt-3 border-t border-gray-200">
                  <button
                    onClick={() => copyMessage(message.content)}
                    className="text-sm text-gray-500 hover:text-black"
                  >
                    Copy
                  </button>
                </div>
              )}
            </div>
          ))}

          {streamingContent && (
            <div className="p-4 rounded-lg border-2 border-black bg-white mr-12">
              <div className="font-bold mb-2">Assistant</div>
              <MarkdownRenderer content={streamingContent} />
              {isTyping && (
                <span className="inline-block w-2 h-4 bg-black ml-1 animate-pulse"></span>
              )}
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        <div className="p-4 border-t-4 border-black bg-white">
          <form onSubmit={handleSubmit} className="flex gap-2">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Type your message..."
              className="flex-1 p-3 border-2 border-black resize-none h-20 focus:outline-none focus:border-4"
              disabled={isLoading}
            />
            <div className="flex flex-col gap-2">
              {isLoading ? (
                <button
                  type="button"
                  onClick={stopGeneration}
                  className="px-6 py-3 bg-red-500 text-white font-bold border-2 border-black hover:bg-red-600 transition-colors"
                >
                  Stop
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={!input.trim()}
                  className="px-6 py-3 bg-[#FFE500] font-bold border-2 border-black disabled:opacity-50 hover:bg-yellow-300 transition-colors"
                >
                  Send
                </button>
              )}
              <button
                type="button"
                onClick={clearChat}
                className="px-6 py-3 bg-gray-200 font-bold border-2 border-black hover:bg-gray-300 transition-colors"
              >
                Clear
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
