import { NextRequest, NextResponse } from 'next/server'
import { google } from 'googleapis'
import { getDriveAccessToken } from '@/lib/drive-auth'

const drive = google.drive({ version: 'v3', auth: new google.auth.OAuth2() })

async function getOrCreateAIChatsFolder(drive: any, vaultFolderId: string): Promise<string> {
  const response = await drive.files.list({
    q: `'${vaultFolderId}' in parents and name = 'AI Chats' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
    fields: 'files(id, name)',
    spaces: 'drive',
  })

  if (response.data.files && response.data.files.length > 0) {
    return response.data.files[0].id!
  }

  const folderMetadata = {
    name: 'AI Chats',
    mimeType: 'application/vnd.google-apps.folder',
    parents: [vaultFolderId],
  }

  const folder = await drive.files.create({
    resource: folderMetadata,
    fields: 'id',
  })

  return folder.data.id!
}

function parseSessionFromMarkdown(content: string): { title: string; messages: Array<{role: string; content: string}>; updatedAt: string } | null {
  const match = content.match(/```json\n([\s\S]*?)\n```/)
  if (!match) return null
  
  try {
    return JSON.parse(match[1])
  } catch {
    return null
  }
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const vaultFolderId = searchParams.get('vaultFolderId')
  const sessionId = searchParams.get('sessionId')

  const auth = getDriveAccessToken()
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }
  ;(drive as any).context._options.auth.setCredentials({ access_token: auth.accessToken })

  if (sessionId) {
    try {
      const response = await drive.files.get({
        fileId: sessionId,
        alt: 'media',
      })

      const session = parseSessionFromMarkdown(response.data as string)
      if (!session) {
        return NextResponse.json({ error: 'Invalid session format' }, { status: 500 })
      }

      return NextResponse.json({ session })
    } catch (error: any) {
      if (error.code === 404 || error.status === 404) {
        return NextResponse.json({ error: 'Session not found' }, { status: 404 })
      }
      return NextResponse.json({ error: 'Failed to load session' }, { status: 500 })
    }
  }

  if (!vaultFolderId) {
    return NextResponse.json({ error: 'vaultFolderId is required' }, { status: 400 })
  }

  try {
    const folderId = await getOrCreateAIChatsFolder(drive, vaultFolderId)

    const response = await drive.files.list({
      q: `'${folderId}' in parents and name contains '.md' and trashed = false`,
      fields: 'files(id, name, modifiedTime)',
      orderBy: 'modifiedTime desc',
      spaces: 'drive',
    })

    const sessions = (response.data.files || []).map(file => ({
      id: file.id,
      name: file.name,
      modifiedTime: file.modifiedTime,
    }))

    return NextResponse.json({ folderId, sessions })
  } catch (error: any) {
    return NextResponse.json({ error: 'Failed to list sessions' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const auth = getDriveAccessToken()
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }
  ;(drive as any).context._options.auth.setCredentials({ access_token: auth.accessToken })

  try {
    const body = await request.json()
    const { vaultFolderId, sessionId, title, messages } = body

    if (!vaultFolderId || !title || !messages) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const folderId = await getOrCreateAIChatsFolder(drive, vaultFolderId)

    if (sessionId) {
      const fileMetadata = {
        name: title.endsWith('.md') ? title : `${title}.md`,
      }

      await drive.files.update({
        fileId: sessionId,
        ...fileMetadata,
      })

      const sessionData = JSON.stringify({ title, messages, updatedAt: new Date().toISOString() })
      const content = `\`\`\`json\n${sessionData}\n\`\`\``

      await drive.files.update({
        fileId: sessionId,
        media: {
          mimeType: 'text/markdown',
          body: content,
        },
      })

      return NextResponse.json({ sessionId })
    }

    const fileName = title.endsWith('.md') ? title : `${title}.md`
    const sessionData = JSON.stringify({ title, messages, updatedAt: new Date().toISOString() })
    const content = `\`\`\`json\n${sessionData}\n\`\`\``

    const fileMetadata = {
      name: fileName,
      parents: [folderId],
    }

    const file = await drive.files.create({
      resource: fileMetadata,
      media: {
        mimeType: 'text/markdown',
        body: content,
      },
      fields: 'id',
    })

    return NextResponse.json({ sessionId: file.data.id })
  } catch (error: any) {
    return NextResponse.json({ error: 'Failed to save session' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const sessionId = searchParams.get('sessionId')

  const auth = getDriveAccessToken()
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }
  ;(drive as any).context._options.auth.setCredentials({ access_token: auth.accessToken })

  if (!sessionId) {
    return NextResponse.json({ error: 'sessionId is required' }, { status: 400 })
  }

  try {
    await drive.files.delete({
      fileId: sessionId,
    })

    return NextResponse.json({ ok: true })
  } catch (error: any) {
    if (error.code === 404 || error.status === 404) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 })
    }
    return NextResponse.json({ error: 'Failed to delete session' }, { status: 500 })
  }
}
