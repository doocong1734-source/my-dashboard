import { google } from 'googleapis'
import { NextRequest, NextResponse } from 'next/server'
import { getDriveAccessToken } from '@/lib/drive-auth'

export async function POST(req: NextRequest) {
  const auth = await getDriveAccessToken(req, ['drive.write'])
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  try {
    const { fileId, targetFolderId, currentFolderId } = await req.json()

    if (!fileId || !/^[a-zA-Z0-9_-]+$/.test(fileId)) {
      return NextResponse.json({ error: 'Invalid fileId' }, { status: 400 })
    }
    if (!targetFolderId || !/^[a-zA-Z0-9_-]+$/.test(targetFolderId)) {
      return NextResponse.json({ error: 'Invalid targetFolderId' }, { status: 400 })
    }

    const oauth2Client = new google.auth.OAuth2()
    oauth2Client.setCredentials({ access_token: auth.accessToken })
    const drive = google.drive({ version: 'v3', auth: oauth2Client })

    await drive.files.update({
      fileId,
      addParents: targetFolderId,
      removeParents: currentFolderId || undefined,
      fields: 'id,parents',
    })

    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'Failed to move file' }, { status: 500 })
  }
}
