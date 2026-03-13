import { google } from 'googleapis'
import { NextRequest, NextResponse } from 'next/server'
import { getDriveAccessToken } from '@/lib/drive-auth'

export async function GET(req: NextRequest) {
  const auth = await getDriveAccessToken(req, ['drive.read'])
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  try {
    const folderId = req.nextUrl.searchParams.get('folderId')
    if (folderId && !/^[a-zA-Z0-9_-]+$/.test(folderId)) {
      return NextResponse.json({ error: 'Invalid folderId' }, { status: 400 })
    }

    const oauth2Client = new google.auth.OAuth2()
    oauth2Client.setCredentials({ access_token: auth.accessToken })
    const drive = google.drive({ version: 'v3', auth: oauth2Client })
    const targetFolderId = folderId || 'root'

    const res = await drive.files.list({
      q: `'${targetFolderId}' in parents and trashed = false`,
      pageSize: 100,
      fields: 'files(id,name,mimeType,size,modifiedTime,webViewLink)',
      orderBy: 'folder,name',
    })

    return NextResponse.json({ files: res.data.files || [] })
  } catch {
    return NextResponse.json({ error: 'Failed to fetch drive files' }, { status: 500 })
  }
}
