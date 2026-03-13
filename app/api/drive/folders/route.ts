import { google } from 'googleapis'
import { NextRequest, NextResponse } from 'next/server'
import { ensureDashboardFolders } from '@/lib/drive-folders'
import { getDriveAccessToken } from '@/lib/drive-auth'

export async function GET(req: NextRequest) {
  const auth = await getDriveAccessToken(req, ['drive.read'])
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  try {
    const oauth2Client = new google.auth.OAuth2()
    oauth2Client.setCredentials({ access_token: auth.accessToken })
    const drive = google.drive({ version: 'v3', auth: oauth2Client })

    const folders = await ensureDashboardFolders(drive)
    return NextResponse.json({ folders })
  } catch {
    return NextResponse.json({ error: 'Failed to ensure dashboard folders' }, { status: 500 })
  }
}
