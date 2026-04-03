import { google } from 'googleapis'
import { NextRequest, NextResponse } from 'next/server'
import { getDriveAccessToken } from '@/lib/drive-auth'

export async function POST(req: NextRequest) {
  const auth = await getDriveAccessToken(req, ['drive.write'])
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  try {
    const { name, parentId } = await req.json()

    if (!name || typeof name !== 'string') {
      return NextResponse.json({ error: 'name is required' }, { status: 400 })
    }
    if (parentId && !/^[a-zA-Z0-9_-]+$/.test(parentId)) {
      return NextResponse.json({ error: 'Invalid parentId' }, { status: 400 })
    }

    const oauth2Client = new google.auth.OAuth2()
    oauth2Client.setCredentials({ access_token: auth.accessToken })
    const drive = google.drive({ version: 'v3', auth: oauth2Client })

    const res = await drive.files.create({
      requestBody: {
        name,
        mimeType: 'application/vnd.google-apps.folder',
        parents: parentId ? [parentId] : ['root'],
      },
      fields: 'id,name,mimeType',
    })

    return NextResponse.json({ folder: res.data })
  } catch {
    return NextResponse.json({ error: 'Failed to create folder' }, { status: 500 })
  }
}
