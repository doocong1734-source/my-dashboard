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

    const mdFiles: { id: string; name: string; mimeType: string; modifiedTime?: string }[] = []
    const folderQueue: string[] = [folderId]

    while (folderQueue.length > 0) {
      const currentFolder = folderQueue.shift()!
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
            folderQueue.push(f.id)
          } else if (f.name.endsWith('.md')) {
            mdFiles.push({
              id: f.id,
              name: f.name,
              mimeType: f.mimeType ?? 'text/markdown',
              modifiedTime: f.modifiedTime ?? undefined,
            })
          }
        }

        pageToken = res.data.nextPageToken ?? undefined
      } while (pageToken)
    }

    return NextResponse.json({ files: mdFiles })
  } catch {
    return NextResponse.json({ error: 'Failed to list vault files' }, { status: 500 })
  }
}
