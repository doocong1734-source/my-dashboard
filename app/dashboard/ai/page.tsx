'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { Send, Loader2, Trash2, Copy, Bot, User, StopCircle } from 'lucide-react';
import MarkdownRenderer from '@/components/MarkdownRenderer';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

const SYSTEM_PROMPTS: { label: string; value: string }[] = [
  { label: '일반', value: '당신은 도움이 되는 AI 어시스턴트입니다. 한국어로 답변하세요.' },
  { label: '코딩', value: '당신은 전문 소프트웨어 개발자입니다. 코드 질문에 명확하고 실용적인 답변을 한국어로 제공하세요.' },
  { label: '글쓰기', value: '당신은 전문 작가이자 편집자입니다. 글쓰기와 편집을 도와주세요. 한국어로 답변하세요.' },
  { label: '번역', value: '당신은 전문 번역가입니다. 요청한 언어로 정확하게 번역하고, 번역 의도와 뉘앙스를 설명해주세요.' },
  { label: '분석', value: '당신은 분석 전문가입니다. 데이터와 정보를 깊이 분석하고 인사이트를 도출해주세요. 한국어로 답변하세요.' },
];

export default function AIPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [selectedPrompt, setSelectedPrompt] = useState(0);
  const [streamingText, setStreamingText] = useState('');
  const abortRef = useRef<AbortController | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/api/auth/signin');
  }, [status, router]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingText]);

  const handleStop = useCallback(() => {
    abortRef.current?.abort();
    setIsLoading(false);
    if (streamingText) {
      setMessages(prev => [...prev, { role: 'assistant', content: streamingText }]);
      setStreamingText('');
    }
  }, [streamingText]);

  const handleSend = useCallback(async () => {
    if (!input.trim() || isLoading) return;

    const userMsg: Message = { role: 'user', content: input.trim() };
    const updatedMessages = [...messages, userMsg];
    setMessages(updatedMessages);
    setInput('');
    setIsLoading(true);
    setStreamingText('');

    abortRef.current = new AbortController();

    try {
      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: updatedMessages,
          systemPrompt: SYSTEM_PROMPTS[selectedPrompt].value,
        }),
        signal: abortRef.current.signal,
      });

      if (!res.ok || !res.body) throw new Error('AI 응답 실패');

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let accumulated = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6).trim();
          if (data === '[DONE]') continue;
          try {
            const parsed = JSON.parse(data);
            // Anthropic SSE format
            if (parsed.type === 'content_block_delta' && parsed.delta?.text) {
              accumulated += parsed.delta.text;
              setStreamingText(accumulated);
            }
          } catch {}
        }
      }

      setMessages(prev => [...prev, { role: 'assistant', content: accumulated }]);
      setStreamingText('');
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        setMessages(prev => [...prev, { role: 'assistant', content: '오류가 발생했습니다. 다시 시도해주세요.' }]);
      }
      setStreamingText('');
    } finally {
      setIsLoading(false);
    }
  }, [input, isLoading, messages, selectedPrompt]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  if (status === 'loading') return (
    <div className="flex h-screen items-center justify-center">
      <Loader2 className="h-10 w-10 animate-spin" />
    </div>
  );

  return (
    <div className="flex h-screen flex-col bg-white">
      {/* Header */}
      <header className="flex shrink-0 items-center justify-between border-b-4 border-black bg-[#FFE500] px-6 py-4">
        <div className="flex items-center gap-3">
          <Bot className="h-6 w-6" strokeWidth={2.5} />
          <h1 className="text-2xl font-black uppercase tracking-tight">AI CHAT</h1>
          <span className="border-2 border-black bg-white px-2 py-0.5 text-xs font-black">MiniMax M2.7</span>
        </div>
        <div className="flex items-center gap-2">
          {/* System prompt selector */}
          <div className="flex border-2 border-black overflow-hidden">
            {SYSTEM_PROMPTS.map((p, i) => (
              <button
                key={i}
                onClick={() => setSelectedPrompt(i)}
                className={`px-3 py-1.5 text-xs font-black transition-all ${
                  selectedPrompt === i ? 'bg-black text-white' : 'bg-white text-black hover:bg-gray-100'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
          <button
            onClick={() => { setMessages([]); setStreamingText(''); }}
            className="flex items-center gap-1 border-2 border-black bg-white px-3 py-1.5 text-xs font-black hover:bg-[#FF6B6B] transition-all"
          >
            <Trash2 className="h-3 w-3" /> 초기화
          </button>
        </div>
      </header>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 && !streamingText && (
          <div className="flex h-full items-center justify-center">
            <div className="text-center">
              <Bot className="mx-auto h-16 w-16 text-gray-200" />
              <p className="mt-4 text-lg font-black text-gray-300 uppercase">MiniMax M2.7</p>
              <p className="text-sm text-gray-400 mt-1">메시지를 입력해서 대화를 시작하세요</p>
              <div className="mt-4 flex flex-wrap gap-2 justify-center max-w-md">
                {['코드 리뷰해줘', '요약해줘', '번역해줘', '아이디어 제안'].map(s => (
                  <button key={s} onClick={() => setInput(s)}
                    className="border-2 border-black px-3 py-1.5 text-xs font-bold hover:bg-[#FFE500] transition-all">
                    {s}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
            <div className={`flex-shrink-0 w-8 h-8 border-2 border-black flex items-center justify-center font-black text-xs ${
              msg.role === 'user' ? 'bg-[#FFE500]' : 'bg-[#B197FC]'
            }`}>
              {msg.role === 'user' ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
            </div>
            <div className={`group relative max-w-[75%] border-2 border-black p-3 shadow-[2px_2px_0_black] ${
              msg.role === 'user' ? 'bg-[#FFE500]' : 'bg-white'
            }`}>
              {msg.role === 'assistant' ? (
                <div className="prose prose-sm max-w-none">
                  <MarkdownRenderer content={msg.content} />
                </div>
              ) : (
                <p className="whitespace-pre-wrap text-sm font-bold">{msg.content}</p>
              )}
              <button
                onClick={() => navigator.clipboard.writeText(msg.content)}
                className="absolute right-2 top-2 opacity-0 group-hover:opacity-100 border border-black p-1 bg-white hover:bg-gray-100 transition-all"
                title="복사"
              >
                <Copy className="h-3 w-3" />
              </button>
            </div>
          </div>
        ))}

        {/* Streaming */}
        {streamingText && (
          <div className="flex gap-3">
            <div className="flex-shrink-0 w-8 h-8 border-2 border-black bg-[#B197FC] flex items-center justify-center">
              <Bot className="h-4 w-4" />
            </div>
            <div className="max-w-[75%] border-2 border-black bg-white p-3 shadow-[2px_2px_0_black]">
              <div className="prose prose-sm max-w-none">
                <MarkdownRenderer content={streamingText} />
              </div>
              <span className="inline-block w-1.5 h-4 bg-black animate-pulse ml-0.5" />
            </div>
          </div>
        )}

        {isLoading && !streamingText && (
          <div className="flex gap-3">
            <div className="w-8 h-8 border-2 border-black bg-[#B197FC] flex items-center justify-center">
              <Bot className="h-4 w-4" />
            </div>
            <div className="border-2 border-black bg-white p-3 shadow-[2px_2px_0_black]">
              <Loader2 className="h-4 w-4 animate-spin" />
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="shrink-0 border-t-4 border-black bg-gray-50 p-4">
        <div className="flex gap-2">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="메시지 입력... (Enter 전송, Shift+Enter 줄바꿈)"
            rows={2}
            className="flex-1 resize-none border-4 border-black bg-white px-3 py-2 font-mono text-sm outline-none focus:shadow-[4px_4px_0_black] transition-all"
          />
          {isLoading ? (
            <button
              onClick={handleStop}
              className="flex items-center gap-2 border-4 border-black bg-[#FF6B6B] px-4 py-2 font-black text-black shadow-[4px_4px_0_black] hover:shadow-none transition-all"
            >
              <StopCircle className="h-5 w-5" />
              중지
            </button>
          ) : (
            <button
              onClick={handleSend}
              disabled={!input.trim()}
              className="flex items-center gap-2 border-4 border-black bg-black px-4 py-2 font-black shadow-[4px_4px_0_black] hover:shadow-none transition-all disabled:opacity-40"
              style={{ color: '#fff' }}
            >
              <Send className="h-5 w-5" />
              전송
            </button>
          )}
        </div>
        <p className="mt-1 text-xs text-gray-400 font-bold">
          {messages.length > 0 && `대화 ${Math.ceil(messages.length / 2)}턴 · `}모델: MiniMax M2.7
        </p>
      </div>
    </div>
  );
}
