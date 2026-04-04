'use client'

import { useFeatureSettings } from './feature-settings-provider'

export default function DashboardThemeWrapper({ children }: { children: React.ReactNode }) {
  const { settings } = useFeatureSettings()
  return (
    <div className={settings.theme === 'galaxy' ? 'theme-galaxy' : ''} style={{ height: '100%' }}>
      {children}
    </div>
  )
}
