import { NextRequest, NextResponse } from 'next/server'
import { getDriveAccessToken } from '@/lib/drive-auth'
import { google } from 'googleapis'

async function streamToString(stream: NodeJS.ReadableStream): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    stream.on('data', (c) => chunks.push(Buffer.from(c)))
    stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')))
    stream.on('error', reject)
  })
}

// GET /api/notes/export?fileId=xxx&format=html|md
export async function GET(req: NextRequest) {
  const fileId = req.nextUrl.searchParams.get('fileId')
  const format = req.nextUrl.searchParams.get('format') ?? 'md'
  if (!fileId) return NextResponse.json({ error: 'fileId required' }, { status: 400 })

  const auth = await getDriveAccessToken(req, ['drive.read'])
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  try {
    const oauth2Client = new google.auth.OAuth2()
    oauth2Client.setCredentials({ access_token: auth.accessToken })
    const drive = google.drive({ version: 'v3', auth: oauth2Client })

    const meta = await drive.files.get({ fileId, fields: 'name' })
    const cr = await drive.files.get({ fileId, alt: 'media' }, { responseType: 'stream' })
    const content = await streamToString(cr.data as unknown as NodeJS.ReadableStream)
    const fileName = (meta.data.name ?? 'note').replace(/\.md$/, '')

    if (format === 'html') {
      // Simple markdown to basic HTML (no external lib needed)
      const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${fileName}</title>
<style>body{font-family:sans-serif;max-width:800px;margin:40px auto;padding:0 20px;line-height:1.6}
code{background:#f4f4f4;padding:2px 6px;border-radius:3px}pre{background:#f4f4f4;padding:16px;overflow:auto}
h1,h2,h3{border-bottom:2px solid #000;padding-bottom:4px}</style></head>
<body><pre style="white-space:pre-wrap;font-family:sans-serif">${content.replace(/</g,'&lt;').replace(/>/g,'&gt;')}</pre></body></html>`
      return new NextResponse(html, {
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'Content-Disposition': `attachment; filename="${fileName}.html"`,
        }
      })
    }

    return new NextResponse(content, {
      headers: {
        'Content-Type': 'text/markdown; charset=utf-8',
        'Content-Disposition': `attachment; filename="${fileName}.md"`,
      }
    })
  } catch {
    return NextResponse.json({ error: 'Export failed' }, { status: 500 })
  }
}
