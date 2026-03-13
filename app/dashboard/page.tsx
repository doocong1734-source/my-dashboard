import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { FileText, BriefcaseBusiness, CheckCircle, Clock, ArrowRight } from 'lucide-react'

export const revalidate = 0

type DashboardDocument = {
  id: string
  name: string
  created_at: string
}

type DashboardJob = {
  id: string
  status: 'pending' | 'running' | 'completed' | 'failed'
  title: string
  agent: string
}

async function getStats() {
  const [{ count: docCount }, { count: pendingCount }, { count: completedCount }, { count: runningCount }] = await Promise.all([
    supabase.from('documents').select('*', { count: 'exact', head: true }),
    supabase.from('jobs').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
    supabase.from('jobs').select('*', { count: 'exact', head: true }).eq('status', 'completed'),
    supabase.from('jobs').select('*', { count: 'exact', head: true }).eq('status', 'running'),
  ])
  return { docCount, pendingCount, completedCount, runningCount }
}

async function getRecent() {
  const [{ data: docs }, { data: jobs }] = await Promise.all([
    supabase.from('documents').select('*').order('created_at', { ascending: false }).limit(5),
    supabase.from('jobs').select('*').order('created_at', { ascending: false }).limit(5),
  ])
  return {
    docs: (docs || []) as DashboardDocument[],
    jobs: (jobs || []) as DashboardJob[],
  }
}

export default async function DashboardPage() {
  const { docCount, pendingCount, completedCount, runningCount } = await getStats()
  const { docs, jobs } = await getRecent()

  const stats = [
    { label: '전체 문서', value: docCount ?? 0, icon: FileText, bg: 'bg-[#FFE500]', href: '/dashboard/documents' },
    { label: '대기 중 Jobs', value: pendingCount ?? 0, icon: Clock, bg: 'bg-[#FF6B6B]', href: '/dashboard/jobs' },
    { label: '완료된 Jobs', value: completedCount ?? 0, icon: CheckCircle, bg: 'bg-[#69DB7C]', href: '/dashboard/jobs' },
    { label: '실행 중', value: runningCount ?? 0, icon: BriefcaseBusiness, bg: 'bg-[#74C0FC]', href: '/dashboard/jobs' },
  ]

  return (
    <div className="p-8">
      <div className="mb-8 border-4 border-black bg-white shadow-[6px_6px_0_black] p-5">
        <h2 className="text-3xl font-black text-black uppercase tracking-tight">대시보드</h2>
        <p className="text-sm font-bold text-gray-600 mt-1">AI 에이전트 현황 및 문서 관리</p>
      </div>

      {/* 통계 카드 */}
      <div className="grid grid-cols-4 gap-4 mb-8">
        {stats.map(({ label, value, icon: Icon, bg, href }) => (
          <Link key={label} href={href}
            className={`${bg} border-4 border-black shadow-[4px_4px_0_black] p-5 hover:shadow-[6px_6px_0_black] hover:-translate-x-0.5 hover:-translate-y-0.5 transition-all block`}>
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-black text-black uppercase">{label}</span>
              <Icon size={18} strokeWidth={2.5} className="text-black" />
            </div>
            <p className="text-4xl font-black text-black">{value}</p>
          </Link>
        ))}
      </div>

      {/* 최근 활동 */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-white border-4 border-black shadow-[4px_4px_0_black] p-5">
          <div className="flex items-center justify-between border-b-2 border-black pb-2 mb-4">
            <h3 className="text-sm font-black text-black uppercase">최근 문서</h3>
            <Link href="/dashboard/documents" className="text-xs font-black text-black flex items-center gap-1 hover:underline">
              전체 보기 <ArrowRight size={12} strokeWidth={2.5} />
            </Link>
          </div>
          {docs.length === 0 ? (
            <p className="text-sm font-bold text-gray-400">아직 문서가 없습니다.</p>
          ) : (
            <div className="space-y-2">
              {docs.map((doc) => (
                <div key={doc.id} className="flex items-center gap-2 text-sm text-black">
                  <FileText size={14} strokeWidth={2.5} className="shrink-0" />
                  <span className="font-bold truncate">{doc.name}</span>
                  <span className="text-xs text-gray-400 shrink-0 ml-auto">{new Date(doc.created_at).toLocaleDateString('ko-KR')}</span>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="bg-white border-4 border-black shadow-[4px_4px_0_black] p-5">
          <div className="flex items-center justify-between border-b-2 border-black pb-2 mb-4">
            <h3 className="text-sm font-black text-black uppercase">최근 Jobs</h3>
            <Link href="/dashboard/jobs" className="text-xs font-black text-black flex items-center gap-1 hover:underline">
              전체 보기 <ArrowRight size={12} strokeWidth={2.5} />
            </Link>
          </div>
          {jobs.length === 0 ? (
            <p className="text-sm font-bold text-gray-400">아직 Jobs가 없습니다.</p>
          ) : (
            <div className="space-y-2">
              {jobs.map((job) => (
                <div key={job.id} className="flex items-center gap-2 text-sm text-black">
                  <span className={`text-xs font-black px-1 border border-black text-black shrink-0 ${job.status === 'completed' ? 'bg-[#69DB7C]' : job.status === 'running' ? 'bg-[#74C0FC]' : job.status === 'failed' ? 'bg-[#FF6B6B]' : 'bg-[#FFE500]'}`}>
                    {job.status.toUpperCase()}
                  </span>
                  <span className="font-bold truncate">{job.title}</span>
                  <span className="text-xs text-gray-400 shrink-0 ml-auto">{job.agent.toUpperCase()}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
