import { google } from 'googleapis'
import { NextRequest, NextResponse } from 'next/server'
import { Readable } from 'stream'
import { assertFolderInsideDashboard, ensureDashboardFolders } from '@/lib/drive-folders'
import { getDriveAccessToken } from '@/lib/drive-auth'

export async function POST(req: NextRequest) {
  const auth = await getDriveAccessToken(req, ['drive.write'])
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  try {
    const formData = await req.formData()
    const maybeFile = formData.get('file')
    const folderId = formData.get('folderId') as string | null

    if (!(maybeFile instanceof File)) {
      return NextResponse.json({ error: 'No file' }, { status: 400 })
    }

    if (folderId && !/^[a-zA-Z0-9_-]+$/.test(folderId)) {
      return NextResponse.json({ error: 'Invalid folderId' }, { status: 400 })
    }

    if (maybeFile.size > 50 * 1024 * 1024) {
      return NextResponse.json({ error: 'File too large (max 50MB)' }, { status: 400 })
    }

    const oauth2Client = new google.auth.OAuth2()
    oauth2Client.setCredentials({ access_token: auth.accessToken })
    const drive = google.drive({ version: 'v3', auth: oauth2Client })
    const folders = await ensureDashboardFolders(drive)

    const targetFolderId = folderId || folders.uploadsId
    await assertFolderInsideDashboard(drive, targetFolderId, folders.rootId)

    const buffer = Buffer.from(await maybeFile.arrayBuffer())
    const res = await drive.files.create({
      requestBody: {
        name: maybeFile.name,
        parents: [targetFolderId],
      },
      media: { mimeType: maybeFile.type, body: Readable.from(buffer) },
      fields: 'id,name,mimeType,size,modifiedTime,webViewLink',
    })

    return NextResponse.json({ file: res.data })
  } catch {
    return NextResponse.json({ error: 'Failed to upload file' }, { status: 500 })
  }
}
