'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Plus, Play, Clock, CheckCircle, XCircle, Trash2, ChevronDown, ChevronUp } from 'lucide-react'
import { useFeatureSettings } from '@/components/feature-settings-provider'

type Job = {
  id: string
  title: string
  description: string
  agent: string
  status: 'pending' | 'running' | 'completed' | 'failed'
  schedule: string
  result: string
  created_at: string
}

const agents = ['sisyphus', 'prometheus', 'metis', 'atlas', 'explore']
const statusConfig = {
  pending:   { label: '대기', bg: 'bg-[#FFE500]', icon: Clock },
  running:   { label: '실행 중', bg: 'bg-[#74C0FC]', icon: Play },
  completed: { label: '완료', bg: 'bg-[#69DB7C]', icon: CheckCircle },
  failed:    { label: '실패', bg: 'bg-[#FF6B6B]', icon: XCircle },
}

export default function JobsPage() {
  const { settings } = useFeatureSettings()
  const [jobs, setJobs] = useState<Job[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ title: '', description: '', agent: 'sisyphus', schedule: '' })
  const [expanded, setExpanded] = useState<string | null>(null)
  const [resultInput, setResultInput] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)

  async function fetchJobs() {
    setError(null)
    try {
      const { data, error: fetchError } = await supabase.from('jobs').select('*').order('created_at', { ascending: false })
      if (fetchError) throw fetchError
      setJobs(data || [])
    } catch (e) {
      setJobs([])
      setError(e instanceof Error ? e.message : 'Jobs를 불러오지 못했습니다.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchJobs() }, [])

  async function handleCreate() {
    if (!settings.jobsCreateEnabled) {
      setError('현재 설정에서 Job 생성 기능이 비활성화되어 있습니다.')
      return
    }

    if (!form.title) return
    setError(null)
    const { error: createError } = await supabase.from('jobs').insert({ ...form, status: 'pending' })
    if (createError) {
      setError('Job 생성 실패: ' + createError.message)
      return
    }
    setForm({ title: '', description: '', agent: 'sisyphus', schedule: '' })
    setShowForm(false)
    fetchJobs()
  }

  async function handleDelete(id: string) {
    if (!settings.jobsDeleteEnabled) {
      setError('현재 설정에서 Job 삭제 기능이 비활성화되어 있습니다.')
      return
    }

    setError(null)
    const { error: deleteError } = await supabase.from('jobs').delete().eq('id', id)
    if (deleteError) {
      setError('Job 삭제 실패: ' + deleteError.message)
      return
    }
    setJobs(prev => prev.filter(j => j.id !== id))
  }

  async function handleStatusChange(id: string, status: Job['status'], result?: string) {
    if (!settings.jobsStatusUpdateEnabled) {
      setError('현재 설정에서 Job 상태 변경 기능이 비활성화되어 있습니다.')
      return
    }

    setError(null)
    const update: Partial<Pick<Job, 'status' | 'result'>> = { status }
    if (result !== undefined) update.result = result
    const { error: updateError } = await supabase.from('jobs').update(update).eq('id', id)
    if (updateError) {
      setError('상태 변경 실패: ' + updateError.message)
      return
    }
    fetchJobs()
  }

  const toggleExpand = (id: string) => setExpanded(prev => prev === id ? null : id)

  return (
    <div className="p-8">
      {/* 헤더 */}
      <div className="flex items-center justify-between mb-8">
        <div className="border-4 border-black bg-white shadow-[6px_6px_0_black] p-5 flex-1 mr-4">
          <h2 className="text-3xl font-black text-black uppercase">Jobs</h2>
          <p className="text-sm font-bold text-gray-600 mt-1">AI 에이전트 작업 스케줄링 · 총 {jobs.length}개</p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          disabled={!settings.jobsCreateEnabled}
          className="bg-[#FFE500] border-4 border-black shadow-[4px_4px_0_black] px-6 py-4 font-black text-black uppercase flex items-center gap-2 hover:shadow-[6px_6px_0_black] hover:-translate-x-0.5 hover:-translate-y-0.5 transition-all"
        >
          <Plus size={18} strokeWidth={2.5} />
          {settings.jobsCreateEnabled ? '새 Job' : '생성 비활성'}
        </button>
      </div>

      {/* 새 Job 폼 */}
      {showForm && (
        <div className="bg-[#f5f0e8] border-4 border-black shadow-[6px_6px_0_black] p-6 mb-6">
          <h3 className="font-black text-black uppercase mb-4 text-lg">새 Job 생성</h3>
          <div className="space-y-3">
            <input
              type="text"
              placeholder="작업 제목 *"
              value={form.title}
              onChange={e => setForm(p => ({ ...p, title: e.target.value }))}
              className="w-full border-4 border-black px-4 py-2.5 font-bold bg-white outline-none focus:shadow-[4px_4px_0_black] text-black"
            />
            <textarea
              placeholder="작업 설명 (에이전트에게 전달할 프롬프트)"
              value={form.description}
              onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
              className="w-full border-4 border-black px-4 py-2.5 font-bold bg-white outline-none focus:shadow-[4px_4px_0_black] resize-none h-24 text-black"
            />
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-black uppercase text-black mb-1 block">에이전트 선택</label>
                <select
                  value={form.agent}
                  onChange={e => setForm(p => ({ ...p, agent: e.target.value }))}
                  className="w-full border-4 border-black px-4 py-2.5 font-bold bg-white outline-none uppercase text-black"
                >
                  {agents.map(a => <option key={a} value={a}>{a.toUpperCase()}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-black uppercase text-black mb-1 block">스케줄 (선택)</label>
                <input
                  type="text"
                  placeholder="예: every 1h, daily"
                  value={form.schedule}
                  onChange={e => setForm(p => ({ ...p, schedule: e.target.value }))}
                  className="w-full border-4 border-black px-4 py-2.5 font-bold bg-white outline-none focus:shadow-[4px_4px_0_black] text-black"
                />
              </div>
            </div>
            <div className="flex gap-3">
              <button onClick={handleCreate} className="bg-[#69DB7C] border-4 border-black px-6 py-2.5 font-black uppercase hover:shadow-[4px_4px_0_black] transition-all text-black">
                생성
              </button>
              <button onClick={() => setShowForm(false)} className="bg-white border-4 border-black px-6 py-2.5 font-black uppercase hover:shadow-[4px_4px_0_black] transition-all text-black">
                취소
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 필터 탭 */}
      {error && (
        <div className="mb-4 border-4 border-black bg-[#FF6B6B] px-4 py-3 font-black text-black">
          {error}
        </div>
      )}

      <div className="flex gap-2 mb-4">
        {(['전체', '대기', '실행 중', '완료', '실패'] as const).map((label, i) => {
          const counts = [jobs.length, jobs.filter(j => j.status === 'pending').length, jobs.filter(j => j.status === 'running').length, jobs.filter(j => j.status === 'completed').length, jobs.filter(j => j.status === 'failed').length]
          return (
            <div key={label} className="bg-white border-2 border-black px-3 py-1 font-black text-xs text-black uppercase">
              {label} <span className="text-gray-500">{counts[i]}</span>
            </div>
          )
        })}
      </div>

      {/* Jobs 목록 */}
      {loading ? (
        <p className="font-black text-black">로딩 중...</p>
      ) : jobs.length === 0 ? (
        <div className="border-4 border-black bg-white shadow-[4px_4px_0_black] p-12 text-center">
          <p className="font-black text-gray-400 uppercase">Jobs가 없습니다</p>
          <p className="text-sm font-bold text-gray-400 mt-2">새 Job을 생성해서 AI 에이전트에게 작업을 할당하세요</p>
        </div>
      ) : (
        <div className="space-y-3">
          {jobs.map(job => {
            const cfg = statusConfig[job.status]
            const StatusIcon = cfg.icon
            const isExpanded = expanded === job.id
            return (
              <div key={job.id} className="bg-white border-4 border-black shadow-[4px_4px_0_black]">
                {/* 메인 행 */}
                <div className="p-4 flex items-center gap-4">
                  <div className={`${cfg.bg} border-2 border-black px-2 py-1 flex items-center gap-1 min-w-[80px] justify-center text-black`}>
                    <StatusIcon size={12} strokeWidth={2.5} />
                    <span className="text-xs font-black uppercase">{cfg.label}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-black text-black">{job.title}</p>
                    <p className="text-xs font-bold text-gray-500">
                      {job.agent.toUpperCase()} {job.schedule && `· ${job.schedule}`} · {new Date(job.created_at).toLocaleDateString('ko-KR')}
                    </p>
                  </div>
                  <div className="flex gap-2 items-center">
                    {job.status === 'pending' && (
                      <button onClick={() => handleStatusChange(job.id, 'running')} disabled={!settings.jobsStatusUpdateEnabled} className="bg-[#74C0FC] border-2 border-black p-2 hover:shadow-[2px_2px_0_black] transition-all text-black disabled:opacity-50" title="실행">
                        <Play size={14} strokeWidth={2.5} />
                      </button>
                    )}
                    <button onClick={() => toggleExpand(job.id)} className="bg-[#f5f0e8] border-2 border-black p-2 hover:shadow-[2px_2px_0_black] transition-all text-black" title="상세">
                      {isExpanded ? <ChevronUp size={14} strokeWidth={2.5} /> : <ChevronDown size={14} strokeWidth={2.5} />}
                    </button>
                    <button onClick={() => handleDelete(job.id)} disabled={!settings.jobsDeleteEnabled} className="bg-[#FF6B6B] border-2 border-black p-2 hover:shadow-[2px_2px_0_black] transition-all text-black disabled:opacity-50" title="삭제">
                      <Trash2 size={14} strokeWidth={2.5} />
                    </button>
                  </div>
                </div>

                {/* 상세 패널 */}
                {isExpanded && (
                  <div className="border-t-4 border-black p-4 bg-[#f5f0e8]">
                    {job.description && (
                      <div className="mb-4">
                        <p className="text-xs font-black uppercase text-black mb-1">작업 설명</p>
                        <p className="text-sm font-bold text-black bg-white border-2 border-black p-3">{job.description}</p>
                      </div>
                    )}

                    {/* 결과 표시 */}
                    {job.result && (
                      <div className="mb-4">
                        <p className="text-xs font-black uppercase text-black mb-1">결과</p>
                        <pre className="text-sm font-bold text-black bg-white border-2 border-black p-3 whitespace-pre-wrap break-all">{job.result}</pre>
                      </div>
                    )}

                    {/* 실행 중일 때 완료/실패 처리 */}
                    {job.status === 'running' && (
                      <div className="space-y-2">
                        <p className="text-xs font-black uppercase text-black">결과 입력</p>
                        <textarea
                          placeholder="작업 결과를 입력하세요..."
                          value={resultInput[job.id] || ''}
                          onChange={e => setResultInput(p => ({ ...p, [job.id]: e.target.value }))}
                          className="w-full border-4 border-black px-3 py-2 font-bold bg-white outline-none resize-none h-20 text-black text-sm"
                        />
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleStatusChange(job.id, 'completed', resultInput[job.id] || '')}
                            disabled={!settings.jobsStatusUpdateEnabled}
                            className="bg-[#69DB7C] border-2 border-black px-4 py-2 font-black text-xs uppercase text-black hover:shadow-[2px_2px_0_black] transition-all flex items-center gap-1"
                          >
                            <CheckCircle size={12} strokeWidth={2.5} /> 완료
                          </button>
                          <button
                            onClick={() => handleStatusChange(job.id, 'failed', resultInput[job.id] || '실패')}
                            disabled={!settings.jobsStatusUpdateEnabled}
                            className="bg-[#FF6B6B] border-2 border-black px-4 py-2 font-black text-xs uppercase text-black hover:shadow-[2px_2px_0_black] transition-all flex items-center gap-1"
                          >
                            <XCircle size={12} strokeWidth={2.5} /> 실패
                          </button>
                          <button
                            onClick={() => handleStatusChange(job.id, 'pending')}
                            disabled={!settings.jobsStatusUpdateEnabled}
                            className="bg-white border-2 border-black px-4 py-2 font-black text-xs uppercase text-black hover:shadow-[2px_2px_0_black] transition-all"
                          >
                            대기로 되돌리기
                          </button>
                        </div>
                      </div>
                    )}

                    {/* 완료/실패된 job 재실행 */}
                    {(job.status === 'completed' || job.status === 'failed') && (
                      <button
                        onClick={() => handleStatusChange(job.id, 'pending')}
                        disabled={!settings.jobsStatusUpdateEnabled}
                        className="bg-white border-2 border-black px-4 py-2 font-black text-xs uppercase text-black hover:shadow-[2px_2px_0_black] transition-all"
                      >
                        대기로 초기화
                      </button>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
