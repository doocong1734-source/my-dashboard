import Link from 'next/link'
import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import { LayoutDashboard, CalendarDays, BriefcaseBusiness, Settings, HardDrive } from 'lucide-react'
import { authOptions } from '@/lib/auth'

const navItems = [
  { href: '/dashboard', label: '대시보드', icon: LayoutDashboard },
  { href: '/dashboard/documents', label: '스케줄', icon: CalendarDays },
  { href: '/dashboard/drive', label: 'Google Drive', icon: HardDrive },
  { href: '/dashboard/jobs', label: 'Jobs', icon: BriefcaseBusiness },
  { href: '/dashboard/settings', label: '설정', icon: Settings },
]

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions)
  if (!session) {
    redirect('/api/auth/signin')
  }

  return (
    <div className="dashboard-theme flex h-screen bg-[#f5f0e8] font-mono">
      {/* 사이드바 */}
      <aside className="w-56 bg-white border-r-4 border-black flex flex-col">
        <div className="p-5 border-b-4 border-black bg-[#FFE500]">
          <h1 className="text-xl font-black text-black uppercase tracking-tight">MY DASHBOARD</h1>
          <p className="text-xs font-bold text-black mt-0.5">AI AGENT CONTROL</p>
        </div>
        <nav className="flex-1 p-3 space-y-2 overflow-auto">
          {navItems.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className="flex items-center gap-3 px-3 py-2.5 border-2 border-black font-bold text-sm text-black hover:bg-[#FFE500] hover:shadow-[3px_3px_0_black] transition-all"
            >
              <Icon size={16} strokeWidth={2.5} />
              <span>{label}</span>
            </Link>
          ))}
        </nav>
        <div className="p-3 border-t-4 border-black">
          <div className="bg-black text-[#FFE500] text-xs font-black px-3 py-2 text-center uppercase">
            ONLINE
          </div>
        </div>
      </aside>

      {/* 메인 */}
      <main className="flex-1 overflow-auto">
        {children}
      </main>
    </div>
  )
}
