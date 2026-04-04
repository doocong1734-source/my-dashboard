'use client'

import { useMemo, useState } from 'react'
import { useSession, signIn, signOut } from 'next-auth/react'
import { User, LogOut, LogIn, Database, Key, ToggleLeft, RotateCcw } from 'lucide-react'
import { useFeatureSettings } from '@/components/feature-settings-provider'

export default function SettingsPage() {
  const { data: session } = useSession()
  const { settings, setSetting, resetSettings } = useFeatureSettings()
  const [shareToken, setShareToken] = useState('')
  const [shareTokenError, setShareTokenError] = useState<string | null>(null)
  const [issuingToken, setIssuingToken] = useState(false)
  const [expiresInMinutes, setExpiresInMinutes] = useState(60)
  const [shareRead, setShareRead] = useState(true)
  const [shareWrite, setShareWrite] = useState(false)

  const scopeCount = useMemo(() => Number(shareRead) + Number(shareWrite), [shareRead, shareWrite])

  async function issueShareToken() {
    if (!shareRead && !shareWrite) {
      setShareTokenError('최소 1개의 권한(scope)을 선택해야 합니다.')
      return
    }

    setIssuingToken(true)
    setShareTokenError(null)

    try {
      const scopes: Array<'drive.read' | 'drive.write'> = []
      if (shareRead) scopes.push('drive.read')
      if (shareWrite) scopes.push('drive.write')

      const res = await fetch('/api/share-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          label: 'dashboard-share',
          scopes,
          expiresInMinutes,
        }),
      })

      const data = await res.json()
      if (!res.ok) {
        throw new Error(data?.error || '토큰 발급에 실패했습니다.')
      }

      setShareToken(data.token || '')
    } catch (e) {
      setShareTokenError(e instanceof Error ? e.message : '토큰 발급에 실패했습니다.')
      setShareToken('')
    } finally {
      setIssuingToken(false)
    }
  }

  async function copyShareToken() {
    if (!shareToken) return
    try {
      await navigator.clipboard.writeText(shareToken)
      setShareTokenError('토큰을 클립보드에 복사했습니다.')
    } catch {
      setShareTokenError('복사에 실패했습니다. 수동으로 복사해 주세요.')
    }
  }

  type BooleanSettingKey = { [K in keyof typeof settings]: typeof settings[K] extends boolean ? K : never }[keyof typeof settings]
  const featureItems: Array<{ key: BooleanSettingKey; label: string; description: string }> = [
    {
      key: 'scheduleCreateEnabled',
      label: '스케줄 생성',
      description: '캘린더 페이지에서 새 일정을 등록할 수 있습니다.',
    },
    {
      key: 'scheduleDeleteEnabled',
      label: '스케줄 삭제',
      description: '캘린더 페이지에서 일정을 삭제할 수 있습니다.',
    },
    {
      key: 'jobsCreateEnabled',
      label: 'Job 생성',
      description: 'Jobs 페이지에서 새 작업 생성 폼을 활성화합니다.',
    },
    {
      key: 'jobsStatusUpdateEnabled',
      label: 'Job 상태 변경',
      description: '실행/완료/실패/대기로 상태 전환을 허용합니다.',
    },
    {
      key: 'jobsDeleteEnabled',
      label: 'Job 삭제',
      description: 'Jobs 페이지에서 작업 삭제를 허용합니다.',
    },
    {
      key: 'skillDocGenerationEnabled',
      label: 'Skill 문서 생성',
      description: 'Skills 페이지에서 템플릿 기반 자동 문서 생성을 허용합니다.',
    },
  ]

  return (
    <div className="p-8">
      <div className="mb-8 border-4 border-black bg-white shadow-[6px_6px_0_black] p-5">
        <h2 className="text-3xl font-black text-black uppercase">설정</h2>
        <p className="text-sm font-bold text-gray-600 mt-1">계정 및 시스템 설정</p>
      </div>

      {/* Google 계정 */}
      <div className="bg-white border-4 border-black shadow-[4px_4px_0_black] p-6 mb-4">
        <div className="flex items-center gap-2 mb-4 border-b-2 border-black pb-3">
          <User size={18} strokeWidth={2.5} />
          <h3 className="font-black uppercase">Google 계정</h3>
        </div>
        {session ? (
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {session.user?.image && (
                <img src={session.user.image} alt="avatar" className="w-10 h-10 border-2 border-black" />
              )}
              <div>
                <p className="font-black text-black">{session.user?.name}</p>
                <p className="text-sm font-bold text-gray-500">{session.user?.email}</p>
              </div>
            </div>
            <button onClick={() => signOut()}
              className="bg-[#FF6B6B] border-4 border-black shadow-[4px_4px_0_black] px-5 py-2.5 font-black uppercase text-black flex items-center gap-2 hover:shadow-[6px_6px_0_black] hover:-translate-x-0.5 hover:-translate-y-0.5 transition-all">
              <LogOut size={16} strokeWidth={2.5} />
              로그아웃
            </button>
          </div>
        ) : (
          <div className="flex items-center justify-between">
            <p className="font-bold text-gray-500">로그인되지 않음</p>
            <button onClick={() => signIn('google')}
              className="bg-[#69DB7C] border-4 border-black shadow-[4px_4px_0_black] px-5 py-2.5 font-black uppercase text-black flex items-center gap-2 hover:shadow-[6px_6px_0_black] hover:-translate-x-0.5 hover:-translate-y-0.5 transition-all">
              <LogIn size={16} strokeWidth={2.5} />
              Google 로그인
            </button>
          </div>
        )}
      </div>

      {/* Supabase 연결 상태 */}
      <div className="bg-white border-4 border-black shadow-[4px_4px_0_black] p-6 mb-4">
        <div className="flex items-center gap-2 mb-4 border-b-2 border-black pb-3">
          <Database size={18} strokeWidth={2.5} />
          <h3 className="font-black uppercase">Supabase DB</h3>
        </div>
        <div className="flex items-center justify-between">
          <div>
            <p className="font-bold text-black">{process.env.NEXT_PUBLIC_SUPABASE_URL?.replace('https://', '').split('.')[0]}.supabase.co</p>
            <p className="text-sm font-bold text-gray-500">PostgreSQL · 스케줄 및 Jobs 저장</p>
          </div>
          <div className="bg-[#69DB7C] border-2 border-black px-3 py-1 font-black text-xs uppercase text-black">
            연결됨
          </div>
        </div>
      </div>

      {/* AI 에이전트 설정 */}
      <div className="bg-white border-4 border-black shadow-[4px_4px_0_black] p-6">
        <div className="flex items-center gap-2 mb-4 border-b-2 border-black pb-3">
          <Key size={18} strokeWidth={2.5} />
          <h3 className="font-black uppercase">AI 에이전트</h3>
        </div>
        <div className="space-y-3">
          {[
            { name: 'SISYPHUS', model: 'Claude Opus 4.6', status: '활성' },
            { name: 'PROMETHEUS', model: 'Claude Opus 4.6', status: '활성' },
            { name: 'ATLAS', model: 'Claude Sonnet 4.6', status: '활성' },
            { name: 'EXPLORE', model: 'Claude Haiku 4.5', status: '활성' },
          ].map(agent => (
            <div key={agent.name} className="flex items-center justify-between border-2 border-black p-3">
              <div>
                <p className="font-black text-sm">{agent.name}</p>
                <p className="text-xs font-bold text-gray-500">{agent.model}</p>
              </div>
              <div className="bg-[#69DB7C] border-2 border-black px-2 py-0.5 font-black text-xs text-black">
                {agent.status}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-white border-4 border-black shadow-[4px_4px_0_black] p-6 mt-4">
        <div className="flex items-center justify-between mb-4 border-b-2 border-black pb-3">
          <div className="flex items-center gap-2">
            <ToggleLeft size={18} strokeWidth={2.5} />
            <h3 className="font-black uppercase">기능 활성화</h3>
          </div>
          <button
            onClick={resetSettings}
            className="bg-white border-2 border-black px-3 py-1.5 text-xs font-black uppercase text-black hover:shadow-[2px_2px_0_black] transition-all flex items-center gap-1"
          >
            <RotateCcw size={12} strokeWidth={2.5} />
            기본값 복원
          </button>
        </div>

        <div className="space-y-3">
          {featureItems.map(item => {
            const enabled = settings[item.key]
            return (
              <label key={item.key} className="flex items-start justify-between gap-4 border-2 border-black p-3 cursor-pointer">
                <div>
                  <p className="font-black text-sm text-black">{item.label}</p>
                  <p className="text-xs font-bold text-gray-500 mt-0.5">{item.description}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className={`text-xs font-black uppercase px-2 py-0.5 border-2 border-black ${enabled ? 'bg-[#69DB7C] text-black' : 'bg-[#FF6B6B] text-black'}`}>
                    {enabled ? 'ON' : 'OFF'}
                  </span>
                  <input
                    type="checkbox"
                    checked={enabled}
                    onChange={e => setSetting(item.key, e.target.checked)}
                    className="h-4 w-4 accent-black"
                  />
                </div>
              </label>
            )
          })}
        </div>
      </div>

      <div className="bg-white border-4 border-black shadow-[4px_4px_0_black] p-6 mt-4">
        <div className="flex items-center gap-2 mb-4 border-b-2 border-black pb-3">
          <Key size={18} strokeWidth={2.5} />
          <h3 className="font-black uppercase">공유 접근 토큰 발급</h3>
        </div>

        <div className="grid grid-cols-2 gap-3 mb-3">
          <label className="border-2 border-black p-3 flex items-center justify-between gap-2">
            <span className="text-sm font-black">drive.read</span>
            <input type="checkbox" checked={shareRead} onChange={e => setShareRead(e.target.checked)} className="h-4 w-4 accent-black" />
          </label>
          <label className="border-2 border-black p-3 flex items-center justify-between gap-2">
            <span className="text-sm font-black">drive.write</span>
            <input type="checkbox" checked={shareWrite} onChange={e => setShareWrite(e.target.checked)} className="h-4 w-4 accent-black" />
          </label>
        </div>

        <div className="mb-3">
          <label className="text-xs font-black uppercase block mb-1">만료(분)</label>
          <input
            type="number"
            min={5}
            max={10080}
            value={expiresInMinutes}
            onChange={e => setExpiresInMinutes(Math.max(5, Math.min(10080, Number(e.target.value) || 60)))}
            className="w-full border-4 border-black px-3 py-2 font-bold bg-white outline-none"
          />
        </div>

        <div className="flex gap-2 mb-3">
          <button
            onClick={issueShareToken}
            disabled={issuingToken || scopeCount === 0}
            className="bg-[#69DB7C] border-4 border-black px-5 py-2 font-black uppercase disabled:opacity-50"
          >
            {issuingToken ? '발급 중...' : '토큰 발급'}
          </button>
          <button
            onClick={copyShareToken}
            disabled={!shareToken}
            className="bg-white border-4 border-black px-5 py-2 font-black uppercase disabled:opacity-50"
          >
            복사
          </button>
        </div>

        {shareTokenError && (
          <div className="mb-3 border-2 border-black bg-[#FFE500] px-3 py-2 text-xs font-black">
            {shareTokenError}
          </div>
        )}

        <textarea
          readOnly
          value={shareToken}
          placeholder="여기에 발급된 공유 토큰이 표시됩니다."
          className="w-full border-4 border-black px-3 py-2 font-bold bg-[#f5f0e8] outline-none resize-none h-24 text-xs"
        />
      </div>
    </div>
  )
}
