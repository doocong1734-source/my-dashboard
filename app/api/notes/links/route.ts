import { google } from 'googleapis'
import { NextRequest, NextResponse } from 'next/server'
import { getDriveAccessToken } from '@/lib/drive-auth'

interface WikiLink {
  sourceId: string
  sourceName: string
  targetName: string
  alias?: string
}

const WIKI_LINK_RE = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g

async function streamToString(stream: NodeJS.ReadableStream): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    stream.on('data', (chunk) => chunks.push(Buffer.from(chunk)))
    stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')))
    stream.on('error', reject)
  })
}

export async function GET(req: NextRequest) {
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

    // Collect all .md files (paginated)
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
      const files = res.data.files || []
      mdFiles.push(...files.filter(f => f.name?.endsWith('.md') && f.id) as { id: string; name: string }[])
      pageToken = res.data.nextPageToken ?? undefined
    } while (pageToken)

    // Build fileMap: name (without .md) -> fileId
    const fileMap: Record<string, string> = {}
    for (const f of mdFiles) {
      fileMap[f.name.replace(/\.md$/, '')] = f.id
    }

    // Parse wiki links from each file
    const links: WikiLink[] = []

    await Promise.all(
      mdFiles.map(async (file) => {
        try {
          const res = await drive.files.get(
            { fileId: file.id, alt: 'media' },
            { responseType: 'stream' }
          )
          const content = await streamToString(res.data as unknown as NodeJS.ReadableStream)

          let match: RegExpExecArray | null
          const re = new RegExp(WIKI_LINK_RE.source, 'g')
          while ((match = re.exec(content)) !== null) {
            links.push({
              sourceId: file.id,
              sourceName: file.name.replace(/\.md$/, ''),
              targetName: match[1].trim(),
              alias: match[2]?.trim(),
            })
          }
        } catch {
          // skip files that can't be read
        }
      })
    )

    return NextResponse.json({ links, fileMap })
  } catch {
    return NextResponse.json({ error: 'Failed to build link index' }, { status: 500 })
  }
}
