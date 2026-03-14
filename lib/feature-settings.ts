export type FeatureSettings = {
  scheduleCreateEnabled: boolean
  scheduleDeleteEnabled: boolean
  jobsCreateEnabled: boolean
  jobsStatusUpdateEnabled: boolean
  jobsDeleteEnabled: boolean
  skillDocGenerationEnabled: boolean
}

export const defaultFeatureSettings: FeatureSettings = {
  scheduleCreateEnabled: true,
  scheduleDeleteEnabled: true,
  jobsCreateEnabled: true,
  jobsStatusUpdateEnabled: true,
  jobsDeleteEnabled: true,
  skillDocGenerationEnabled: true,
}

export const featureSettingsStorageKey = 'my-dashboard-feature-settings'
