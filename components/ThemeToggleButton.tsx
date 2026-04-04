'use client'

import { useFeatureSettings } from './feature-settings-provider'
import type { DashboardTheme } from '@/lib/feature-settings'

export default function ThemeToggleButton() {
  const { settings, setSetting } = useFeatureSettings()
  const isGalaxy = settings.theme === 'galaxy'

  function toggle() {
    const next: DashboardTheme = isGalaxy ? 'brutalist' : 'galaxy'
    setSetting('theme', next)
  }

  return (
    <button
      onClick={toggle}
      className="flex items-center gap-2 w-full border-2 border-black bg-white px-3 py-2 font-bold text-xs text-black hover:bg-[#FFE500] transition-all"
      title="테마 전환"
    >
      <span>{isGalaxy ? '🌙' : '⚡'}</span>
      <span>{isGalaxy ? 'Galaxy Mode' : 'Brutalist'}</span>
    </button>
  )
}
