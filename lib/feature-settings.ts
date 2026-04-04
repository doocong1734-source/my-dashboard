export type DashboardTheme = 'brutalist' | 'galaxy'

export type FeatureSettings = {
  scheduleCreateEnabled: boolean
  scheduleDeleteEnabled: boolean
  jobsCreateEnabled: boolean
  jobsStatusUpdateEnabled: boolean
  jobsDeleteEnabled: boolean
  skillDocGenerationEnabled: boolean
  theme: DashboardTheme
}

export const defaultFeatureSettings: FeatureSettings = {
  scheduleCreateEnabled: true,
  scheduleDeleteEnabled: true,
  jobsCreateEnabled: true,
  jobsStatusUpdateEnabled: true,
  jobsDeleteEnabled: true,
  skillDocGenerationEnabled: true,
  theme: 'brutalist',
}

export const featureSettingsStorageKey = 'my-dashboard-feature-settings'
