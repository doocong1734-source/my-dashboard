import { getServerSession } from 'next-auth'
import { NextRequest, NextResponse } from 'next/server'
import { authOptions } from '@/lib/auth'
import { supabase } from '@/lib/supabase'

type DocumentRow = {
  id: string
  skill_id: string
  title: string
  input_payload: Record<string, string>
  generated_content: string
  status: string
  created_at: string
}

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { data, error } = await supabase
      .from('generated_documents')
      .select('id, skill_id, title, input_payload, generated_content, status, created_at')
      .order('created_at', { ascending: false })

    if (error) {
      return NextResponse.json({ error: 'Failed to load documents' }, { status: 500 })
    }

    return NextResponse.json({ documents: (data || []) as DocumentRow[] })
  } catch {
    return NextResponse.json({ error: 'Unexpected error while loading documents' }, { status: 500 })
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const raw = await req.json()
    if (!isPlainObject(raw)) {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
    }

    const id = raw.id
    const title = raw.title
    const generatedContent = raw.generatedContent
    const status = raw.status

    if (typeof id !== 'string' || !id.trim()) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 })
    }

    if (typeof title !== 'string' || !title.trim()) {
      return NextResponse.json({ error: 'title is required' }, { status: 400 })
    }

    if (typeof generatedContent !== 'string' || !generatedContent.trim()) {
      return NextResponse.json({ error: 'generatedContent is required' }, { status: 400 })
    }

    if (typeof status !== 'string' || !status.trim()) {
      return NextResponse.json({ error: 'status is required' }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('generated_documents')
      .update({
        title: title.trim(),
        generated_content: generatedContent,
        status: status.trim(),
      })
      .eq('id', id.trim())
      .select('id, skill_id, title, input_payload, generated_content, status, created_at')
      .single()

    if (error) {
      return NextResponse.json({ error: 'Failed to update document' }, { status: 500 })
    }

    return NextResponse.json({ document: data as DocumentRow })
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
}

export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const raw = await req.json()
    if (!isPlainObject(raw) || typeof raw.id !== 'string' || !raw.id.trim()) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 })
    }

    const { error } = await supabase
      .from('generated_documents')
      .delete()
      .eq('id', raw.id.trim())

    if (error) {
      return NextResponse.json({ error: 'Failed to delete document' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
}
