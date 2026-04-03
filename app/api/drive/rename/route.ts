import { google } from 'googleapis'
import { NextRequest, NextResponse } from 'next/server'
import { getDriveAccessToken } from '@/lib/drive-auth'

export async function POST(req: NextRequest) {
  const auth = await getDriveAccessToken(req, ['drive.write'])
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  try {
    const { fileId, name } = await req.json()

    if (!fileId || !/^[a-zA-Z0-9_-]+$/.test(fileId)) {
      return NextResponse.json({ error: 'Invalid fileId' }, { status: 400 })
    }
    if (!name || typeof name !== 'string') {
      return NextResponse.json({ error: 'name is required' }, { status: 400 })
    }

    const oauth2Client = new google.auth.OAuth2()
    oauth2Client.setCredentials({ access_token: auth.accessToken })
    const drive = google.drive({ version: 'v3', auth: oauth2Client })

    const res = await drive.files.update({
      fileId,
      requestBody: { name },
      fields: 'id,name,mimeType,modifiedTime',
    })

    return NextResponse.json({ file: res.data })
  } catch {
    return NextResponse.json({ error: 'Failed to rename file' }, { status: 500 })
  }
}
