import { google } from 'googleapis'
import { NextRequest, NextResponse } from 'next/server'
import { getDriveAccessToken } from '@/lib/drive-auth'

export async function GET(req: NextRequest) {
  const auth = await getDriveAccessToken(req, ['drive.read'])
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const fileId = req.nextUrl.searchParams.get('fileId')
  if (!fileId || !/^[a-zA-Z0-9_-]+$/.test(fileId)) {
    return NextResponse.json({ error: 'Invalid fileId' }, { status: 400 })
  }

  try {
    const oauth2Client = new google.auth.OAuth2()
    oauth2Client.setCredentials({ access_token: auth.accessToken })
    const drive = google.drive({ version: 'v3', auth: oauth2Client })

    const res = await drive.files.get(
      { fileId, alt: 'media' },
      { responseType: 'text' }
    )

    return NextResponse.json({ content: res.data as string })
  } catch {
    return NextResponse.json({ error: 'Failed to fetch file content' }, { status: 500 })
  }
}
