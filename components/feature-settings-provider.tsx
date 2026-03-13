'use client'

import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import {
  defaultFeatureSettings,
  featureSettingsStorageKey,
  type FeatureSettings,
} from '@/lib/feature-settings'

type FeatureSettingsContextValue = {
  settings: FeatureSettings
  setSetting: <K extends keyof FeatureSettings>(key: K, value: FeatureSettings[K]) => void
  resetSettings: () => void
}

const FeatureSettingsContext = createContext<FeatureSettingsContextValue | undefined>(undefined)

export default function FeatureSettingsProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<FeatureSettings>(() => {
    if (typeof window === 'undefined') {
      return defaultFeatureSettings
    }

    try {
      const raw = window.localStorage.getItem(featureSettingsStorageKey)
      if (!raw) return defaultFeatureSettings
      const parsed = JSON.parse(raw) as Partial<FeatureSettings>
      return { ...defaultFeatureSettings, ...parsed }
    } catch {
      return defaultFeatureSettings
    }
  })

  useEffect(() => {
    window.localStorage.setItem(featureSettingsStorageKey, JSON.stringify(settings))
  }, [settings])

  const value = useMemo<FeatureSettingsContextValue>(() => ({
    settings,
    setSetting: (key, value) => {
      setSettings(prev => ({ ...prev, [key]: value }))
    },
    resetSettings: () => {
      setSettings(defaultFeatureSettings)
      window.localStorage.removeItem(featureSettingsStorageKey)
    },
  }), [settings])

  return (
    <FeatureSettingsContext.Provider value={value}>
      {children}
    </FeatureSettingsContext.Provider>
  )
}

export function useFeatureSettings() {
  const context = useContext(FeatureSettingsContext)
  if (!context) {
    throw new Error('useFeatureSettings must be used within FeatureSettingsProvider')
  }
  return context
}
