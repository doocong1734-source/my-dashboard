export type FeatureSettings = {
  scheduleCreateEnabled: boolean
  scheduleDeleteEnabled: boolean
  jobsCreateEnabled: boolean
  jobsStatusUpdateEnabled: boolean
  jobsDeleteEnabled: boolean
}

export const defaultFeatureSettings: FeatureSettings = {
  scheduleCreateEnabled: true,
  scheduleDeleteEnabled: true,
  jobsCreateEnabled: true,
  jobsStatusUpdateEnabled: true,
  jobsDeleteEnabled: true,
}

export const featureSettingsStorageKey = 'my-dashboard-feature-settings'
