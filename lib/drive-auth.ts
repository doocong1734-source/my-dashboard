import { getServerSession } from 'next-auth'
import { NextRequest } from 'next/server'
import { authOptions } from '@/lib/auth'
import { verifyShareToken, type ShareTokenScope } from '@/lib/share-token'

type DriveAuthResult =
  | { ok: true; accessToken: string; mode: 'session' | 'share-token' }
  | { ok: false; status: number; error: string }

function hasScopes(granted: ShareTokenScope[], required: ShareTokenScope[]) {
  return required.every(scope => granted.includes(scope))
}

export async function getDriveAccessToken(req: NextRequest, requiredScopes: ShareTokenScope[]): Promise<DriveAuthResult> {
  const session = await getServerSession(authOptions)
  if (session?.accessToken) {
    return { ok: true, accessToken: session.accessToken, mode: 'session' }
  }

  const authHeader = req.headers.get('authorization')
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return { ok: false, status: 401, error: 'Unauthorized' }
  }

  const token = authHeader.slice('Bearer '.length)
  const payload = verifyShareToken(token)
  if (!payload) {
    return { ok: false, status: 401, error: 'Invalid or expired share token' }
  }

  if (!hasScopes(payload.scopes, requiredScopes)) {
    return { ok: false, status: 403, error: 'Insufficient scope' }
  }

  return { ok: true, accessToken: payload.googleAccessToken, mode: 'share-token' }
}
