'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'
import {
  LayoutDashboard, CalendarDays, BriefcaseBusiness, Settings,
  HardDrive, WandSparkles, NotebookPen, Bot, Menu, X, Newspaper
} from 'lucide-react'
import { SignOutButton } from './SignOutButton'
import ThemeToggleButton from './ThemeToggleButton'

const navItems = [
  { href: '/dashboard', label: '대시보드', icon: LayoutDashboard },
  { href: '/dashboard/news', label: '뉴스', icon: Newspaper },
  { href: '/dashboard/notes', label: 'Notes', icon: NotebookPen },
  { href: '/dashboard/ai', label: 'AI Chat', icon: Bot },
  { href: '/dashboard/documents', label: '스케줄', icon: CalendarDays },
  { href: '/dashboard/drive', label: 'Google Drive', icon: HardDrive },
  { href: '/dashboard/jobs', label: 'Jobs', icon: BriefcaseBusiness },
  { href: '/dashboard/skills', label: 'Skills', icon: WandSparkles },
  { href: '/dashboard/settings', label: '설정', icon: Settings },
]

export default function MobileSidebar() {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex w-56 bg-white border-r-4 border-black flex-col shrink-0">
        <div className="p-5 border-b-4 border-black bg-[#FFE500]">
          <h1 className="text-xl font-black text-black uppercase tracking-tight">MY DASHBOARD</h1>
          <p className="text-xs font-bold text-black mt-0.5">AI AGENT CONTROL</p>
        </div>
        <nav className="flex-1 p-3 space-y-2 overflow-auto">
          {navItems.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-3 px-3 py-2.5 border-2 border-black font-bold text-sm text-black hover:bg-[#FFE500] hover:shadow-[3px_3px_0_black] transition-all ${pathname === href ? 'bg-[#FFE500]' : ''}`}
            >
              <Icon size={16} strokeWidth={2.5} />
              <span>{label}</span>
            </Link>
          ))}
        </nav>
        <div className="p-3 border-t-4 border-black space-y-2">
          <div className="bg-black text-[#FFE500] text-xs font-black px-3 py-2 text-center uppercase">ONLINE</div>
          <ThemeToggleButton />
          <SignOutButton />
        </div>
      </aside>

      {/* Mobile: top bar + slide-out drawer */}
      <div className="lg:hidden">
        {/* Top bar */}
        <div className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between bg-[#FFE500] border-b-4 border-black px-4 py-3">
          <span className="font-black text-black text-sm uppercase tracking-tight">MY DASHBOARD</span>
          <button onClick={() => setOpen(true)} className="text-black">
            <Menu size={22} strokeWidth={2.5} />
          </button>
        </div>

        {/* Drawer overlay */}
        {open && (
          <div className="fixed inset-0 z-50 flex">
            <div className="w-64 bg-white border-r-4 border-black flex flex-col h-full shadow-2xl">
              <div className="flex items-center justify-between p-4 bg-[#FFE500] border-b-4 border-black">
                <span className="font-black text-black uppercase">Menu</span>
                <button onClick={() => setOpen(false)} className="text-black">
                  <X size={20} strokeWidth={2.5} />
                </button>
              </div>
              <nav className="flex-1 p-3 space-y-2 overflow-auto">
                {navItems.map(({ href, label, icon: Icon }) => (
                  <Link
                    key={href}
                    href={href}
                    onClick={() => setOpen(false)}
                    className={`flex items-center gap-3 px-3 py-3 border-2 border-black font-bold text-sm text-black hover:bg-[#FFE500] transition-all ${pathname === href ? 'bg-[#FFE500]' : ''}`}
                  >
                    <Icon size={18} strokeWidth={2.5} />
                    <span>{label}</span>
                  </Link>
                ))}
              </nav>
              <div className="p-3 border-t-4 border-black space-y-2">
                <ThemeToggleButton />
                <SignOutButton />
              </div>
            </div>
            {/* Backdrop */}
            <div className="flex-1 bg-black/50" onClick={() => setOpen(false)} />
          </div>
        )}
      </div>
    </>
  )
}
