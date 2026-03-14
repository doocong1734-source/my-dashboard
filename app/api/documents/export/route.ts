import { getServerSession } from 'next-auth'
import { NextRequest, NextResponse } from 'next/server'
import { authOptions } from '@/lib/auth'
import { supabase } from '@/lib/supabase'

function safeFileName(input: string) {
  return input.replace(/[^a-zA-Z0-9-_가-힣\s]/g, '').trim().replace(/\s+/g, '_')
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const raw = await req.json()
    if (!isPlainObject(raw) || typeof raw.id !== 'string' || !raw.id.trim()) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('generated_documents')
      .select('title, generated_content')
      .eq('id', raw.id.trim())
      .single()

    if (error || !data) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 })
    }

    const filename = `${safeFileName(data.title || 'generated-document') || 'generated-document'}.md`
    return new NextResponse(data.generated_content || '', {
      status: 200,
      headers: {
        'Content-Type': 'text/markdown; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store',
      },
    })
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
}
