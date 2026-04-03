import { google } from 'googleapis'
import { NextRequest, NextResponse } from 'next/server'
import { getDriveAccessToken } from '@/lib/drive-auth'

async function streamToString(stream: NodeJS.ReadableStream): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    stream.on('data', (c) => chunks.push(Buffer.from(c)))
    stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')))
    stream.on('error', reject)
  })
}

export async function GET(req: NextRequest) {
  const auth = await getDriveAccessToken(req, ['drive.read'])
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  try {
    const oauth2Client = new google.auth.OAuth2()
    oauth2Client.setCredentials({ access_token: auth.accessToken })
    const drive = google.drive({ version: 'v3', auth: oauth2Client })

    // Find files in Templates folder or named Template*
    const res = await drive.files.list({
      q: "trashed = false and (name contains 'Template' and name contains '.md')",
      pageSize: 50,
      fields: 'files(id,name)',
    })

    const templates = await Promise.all(
      (res.data.files || []).map(async (f) => {
        try {
          const cr = await drive.files.get({ fileId: f.id!, alt: 'media' }, { responseType: 'stream' })
          const content = await streamToString(cr.data as unknown as NodeJS.ReadableStream)
          return { id: f.id!, name: f.name!.replace(/\.md$/, ''), content }
        } catch { return null }
      })
    )

    return NextResponse.json({ templates: templates.filter(Boolean) })
  } catch {
    return NextResponse.json({ error: 'Failed to fetch templates' }, { status: 500 })
  }
}
