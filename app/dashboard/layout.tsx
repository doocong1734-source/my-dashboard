import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import DashboardThemeWrapper from '@/components/DashboardThemeWrapper'
import MobileSidebar from '@/components/MobileSidebar'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions)
  if (!session) {
    redirect('/api/auth/signin')
  }

  return (
    <DashboardThemeWrapper>
      <div className="dashboard-theme flex flex-col lg:flex-row h-screen bg-[#f5f0e8]">
        <MobileSidebar />
        {/* 메인 */}
        <main className="flex-1 overflow-auto min-w-0 lg:pt-0 pt-[57px]">
          {children}
        </main>
      </div>
    </DashboardThemeWrapper>
  )
}
