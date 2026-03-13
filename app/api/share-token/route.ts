import { getServerSession } from 'next-auth'
import { NextRequest, NextResponse } from 'next/server'
import { authOptions } from '@/lib/auth'
import { signShareToken, type ShareTokenScope } from '@/lib/share-token'

type Body = {
  label?: string
  scopes?: ShareTokenScope[]
  expiresInMinutes?: number
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.accessToken || !session.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = (await req.json()) as Body
    const scopes = Array.isArray(body.scopes) && body.scopes.length > 0 ? body.scopes : ['drive.read']

    const scopesAreValid = scopes.every(scope => scope === 'drive.read' || scope === 'drive.write')
    if (!scopesAreValid) {
      return NextResponse.json({ error: 'Invalid scopes' }, { status: 400 })
    }

    const expiresInMinutes = typeof body.expiresInMinutes === 'number' ? body.expiresInMinutes : 60
    if (expiresInMinutes < 5 || expiresInMinutes > 7 * 24 * 60) {
      return NextResponse.json({ error: 'expiresInMinutes must be between 5 and 10080' }, { status: 400 })
    }

    const iat = Math.floor(Date.now() / 1000)
    const exp = iat + expiresInMinutes * 60

    const token = signShareToken({
      sub: session.user.email,
      scopes,
      iat,
      exp,
      googleAccessToken: session.accessToken,
    })

    return NextResponse.json({
      token,
      tokenType: 'Bearer',
      label: body.label || 'shared-access',
      scopes,
      expiresAt: new Date(exp * 1000).toISOString(),
      note: 'Share this token securely. It grants scoped access to Drive API routes.',
    })
  } catch {
    return NextResponse.json({ error: 'Failed to issue share token' }, { status: 500 })
  }
}
