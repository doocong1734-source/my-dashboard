import { google } from 'googleapis'
import { NextRequest, NextResponse } from 'next/server'
import { getDriveAccessToken } from '@/lib/drive-auth'

async function streamToString(stream: NodeJS.ReadableStream): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    stream.on('data', (chunk) => chunks.push(Buffer.from(chunk)))
    stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')))
    stream.on('error', reject)
  })
}

function extractSnippet(content: string, query: string): string {
  const idx = content.toLowerCase().indexOf(query.toLowerCase())
  if (idx === -1) return content.slice(0, 120) + '...'
  const start = Math.max(0, idx - 80)
  const end = Math.min(content.length, idx + query.length + 80)
  return (start > 0 ? '...' : '') + content.slice(start, end) + (end < content.length ? '...' : '')
}

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get('q')?.trim() ?? ''
  if (!q) return NextResponse.json({ results: [] })

  const folderId = req.nextUrl.searchParams.get('folderId')
  if (folderId && !/^[a-zA-Z0-9_-]+$/.test(folderId)) {
    return NextResponse.json({ error: 'Invalid folderId' }, { status: 400 })
  }

  const auth = await getDriveAccessToken(req, ['drive.read'])
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  try {
    const oauth2Client = new google.auth.OAuth2()
    oauth2Client.setCredentials({ access_token: auth.accessToken })
    const drive = google.drive({ version: 'v3', auth: oauth2Client })

    const folderFilter = folderId ? `'${folderId}' in parents and ` : ''
    const mdFiles: { id: string; name: string }[] = []
    let pageToken: string | undefined
    do {
      const res = await drive.files.list({
        q: `${folderFilter}trashed = false and name contains '.md'`,
        pageSize: 100,
        fields: 'nextPageToken, files(id,name)',
        pageToken,
      })
      mdFiles.push(...(res.data.files || []).filter(f => f.name?.endsWith('.md') && f.id) as { id: string; name: string }[])
      pageToken = res.data.nextPageToken ?? undefined
    } while (pageToken)

    const ql = q.toLowerCase()
    type Result = { fileId: string; fileName: string; snippet: string; matchType: 'filename' | 'content' | 'both'; matchCount: number }
    const results: Result[] = []

    await Promise.all(
      mdFiles.map(async (file) => {
        const nameMatch = file.name.toLowerCase().includes(ql)
        let content = ''
        try {
          const res = await drive.files.get({ fileId: file.id, alt: 'media' }, { responseType: 'stream' })
          content = await streamToString(res.data as unknown as NodeJS.ReadableStream)
        } catch { return }

        const contentLower = content.toLowerCase()
        let matchCount = 0
        let pos = 0
        while ((pos = contentLower.indexOf(ql, pos)) !== -1) { matchCount++; pos += ql.length }

        if (!nameMatch && matchCount === 0) return

        results.push({
          fileId: file.id,
          fileName: file.name.replace(/\.md$/, ''),
          snippet: matchCount > 0 ? extractSnippet(content, q) : '',
          matchType: nameMatch && matchCount > 0 ? 'both' : nameMatch ? 'filename' : 'content',
          matchCount,
        })
      })
    )

    results.sort((a, b) => {
      if (a.matchType !== b.matchType) {
        const order = { both: 0, filename: 1, content: 2 }
        return order[a.matchType] - order[b.matchType]
      }
      return b.matchCount - a.matchCount
    })

    return NextResponse.json({ results: results.slice(0, 20) })
  } catch {
    return NextResponse.json({ error: 'Search failed' }, { status: 500 })
  }
}
