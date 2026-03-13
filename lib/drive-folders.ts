import { google } from 'googleapis'

type DriveClient = ReturnType<typeof google.drive>

export type DashboardFolderMap = {
  rootId: string
  schedulesId: string
  jobsId: string
  documentsId: string
  uploadsId: string
}

export type DashboardFolderName = 'schedules' | 'jobs' | 'documents' | 'uploads'

async function findFolderByName(drive: DriveClient, name: string, parentId: string) {
  const res = await drive.files.list({
    q: `mimeType = 'application/vnd.google-apps.folder' and name = '${name.replace(/'/g, "\\'")}' and '${parentId}' in parents and trashed = false`,
    pageSize: 1,
    fields: 'files(id,name)',
  })

  return res.data.files?.[0] || null
}

async function createFolder(drive: DriveClient, name: string, parentId?: string) {
  const res = await drive.files.create({
    requestBody: {
      name,
      mimeType: 'application/vnd.google-apps.folder',
      parents: parentId ? [parentId] : undefined,
    },
    fields: 'id,name',
  })

  if (!res.data.id) {
    throw new Error(`Failed to create folder: ${name}`)
  }

  return res.data.id
}

async function ensureFolder(drive: DriveClient, name: string, parentId: string) {
  const found = await findFolderByName(drive, name, parentId)
  if (found?.id) return found.id
  return createFolder(drive, name, parentId)
}

export async function ensureDashboardFolders(drive: DriveClient): Promise<DashboardFolderMap> {
  const rootFound = await drive.files.list({
    q: `mimeType = 'application/vnd.google-apps.folder' and name = 'my dashboard' and 'root' in parents and trashed = false`,
    pageSize: 1,
    fields: 'files(id,name)',
  })

  const rootId = rootFound.data.files?.[0]?.id || (await createFolder(drive, 'my dashboard'))

  const schedulesId = await ensureFolder(drive, 'schedules', rootId)
  const jobsId = await ensureFolder(drive, 'jobs', rootId)
  const documentsId = await ensureFolder(drive, 'documents', rootId)
  const uploadsId = await ensureFolder(drive, 'uploads', rootId)

  return {
    rootId,
    schedulesId,
    jobsId,
    documentsId,
    uploadsId,
  }
}

export async function getFolderById(drive: DriveClient, folderId: string) {
  const res = await drive.files.get({
    fileId: folderId,
    fields: 'id,name,parents,mimeType',
  })
  return res.data
}

export async function isDescendantOfRoot(drive: DriveClient, targetId: string, rootId: string): Promise<boolean> {
  if (targetId === rootId) return true

  let currentId: string | undefined = targetId
  const visited = new Set<string>()

  while (currentId) {
    if (visited.has(currentId)) return false
    visited.add(currentId)

    const info = await getFolderById(drive, currentId)
    const parents = info.parents || []
    if (parents.includes(rootId)) return true

    currentId = parents[0]
    if (!currentId || currentId === 'root') return false
  }

  return false
}

export async function assertFolderInsideDashboard(drive: DriveClient, folderId: string, rootId: string) {
  const inside = await isDescendantOfRoot(drive, folderId, rootId)
  if (!inside) {
    throw new Error('Folder is outside dashboard scope')
  }
}

export async function assertFileInsideDashboard(drive: DriveClient, fileId: string, rootId: string) {
  const file = await drive.files.get({ fileId, fields: 'id,parents' })
  const parentId = file.data.parents?.[0]
  if (!parentId) {
    throw new Error('File has no parent')
  }
  await assertFolderInsideDashboard(drive, parentId, rootId)
}
