import { google } from 'googleapis'
import { NextRequest, NextResponse } from 'next/server'
import { getDriveAccessToken } from '@/lib/drive-auth'

export async function DELETE(req: NextRequest) {
  const auth = await getDriveAccessToken(req, ['drive.write'])
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  try {
    const body = await req.json() as { fileId?: string }
    if (!body.fileId || !/^[a-zA-Z0-9_-]+$/.test(body.fileId)) {
      return NextResponse.json({ error: 'Invalid fileId' }, { status: 400 })
    }

    const oauth2Client = new google.auth.OAuth2()
    oauth2Client.setCredentials({ access_token: auth.accessToken })
    const drive = google.drive({ version: 'v3', auth: oauth2Client })

    await drive.files.delete({ fileId: body.fileId })
    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: 'Failed to delete file' }, { status: 500 })
  }
}
