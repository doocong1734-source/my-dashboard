import { google } from 'googleapis'
import { NextRequest, NextResponse } from 'next/server'
import { getDriveAccessToken } from '@/lib/drive-auth'

export async function GET(req: NextRequest) {
  const folderId = req.nextUrl.searchParams.get('folderId')
  if (!folderId || !/^[a-zA-Z0-9_-]+$/.test(folderId)) {
    return NextResponse.json({ error: 'folderId required' }, { status: 400 })
  }

  const auth = await getDriveAccessToken(req, ['drive.read'])
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  try {
    const oauth2Client = new google.auth.OAuth2()
    oauth2Client.setCredentials({ access_token: auth.accessToken })
    const drive = google.drive({ version: 'v3', auth: oauth2Client })

    const allFiles: { id: string; name: string; mimeType: string; modifiedTime?: string; parentId?: string }[] = []
    const folderQueue: Array<{ id: string; parentId?: string }> = [{ id: folderId }]

    while (folderQueue.length > 0) {
      const { id: currentFolder, parentId } = folderQueue.shift()!
      // Add folder node itself (except the root vault folder)
      if (parentId !== undefined) {
        allFiles.push({ id: currentFolder, name: '', mimeType: 'application/vnd.google-apps.folder', parentId })
      }
      let pageToken: string | undefined

      do {
        const res = await drive.files.list({
          q: `'${currentFolder}' in parents and trashed = false`,
          pageSize: 100,
          fields: 'nextPageToken, files(id,name,mimeType,modifiedTime)',
          pageToken,
        })

        for (const f of res.data.files || []) {
          if (!f.id || !f.name) continue
          if (f.mimeType === 'application/vnd.google-apps.folder') {
            folderQueue.push({ id: f.id, parentId: currentFolder })
            allFiles.push({ id: f.id, name: f.name, mimeType: 'application/vnd.google-apps.folder', parentId: currentFolder })
          } else {
            allFiles.push({
              id: f.id,
              name: f.name,
              mimeType: f.mimeType ?? 'text/plain',
              modifiedTime: f.modifiedTime ?? undefined,
              parentId: currentFolder,
            })
          }
        }

        pageToken = res.data.nextPageToken ?? undefined
      } while (pageToken)
    }

    // Remove the duplicate folder entries we added for BFS traversal
    const seen = new Set<string>()
    const dedupedFiles = allFiles.filter(f => {
      if (seen.has(f.id)) return false
      seen.add(f.id)
      return true
    })

    return NextResponse.json({ files: dedupedFiles })
  } catch {
    return NextResponse.json({ error: 'Failed to list vault files' }, { status: 500 })
  }
}
