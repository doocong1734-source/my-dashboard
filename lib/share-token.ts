import crypto from 'crypto'

export type ShareTokenScope = 'drive.read' | 'drive.write'

export type ShareTokenPayload = {
  sub: string
  scopes: ShareTokenScope[]
  iat: number
  exp: number
  googleAccessToken: string
}

function getSecret() {
  const secret = process.env.SHARE_TOKEN_SECRET || process.env.NEXTAUTH_SECRET
  if (!secret) {
    throw new Error('Missing SHARE_TOKEN_SECRET (or NEXTAUTH_SECRET)')
  }
  return secret
}

function base64UrlEncode(input: string | Buffer) {
  return Buffer.from(input)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '')
}

function base64UrlDecode(input: string) {
  const normalized = input.replace(/-/g, '+').replace(/_/g, '/')
  const padLength = (4 - (normalized.length % 4)) % 4
  return Buffer.from(normalized + '='.repeat(padLength), 'base64').toString('utf8')
}

function sign(data: string) {
  return base64UrlEncode(crypto.createHmac('sha256', getSecret()).update(data).digest())
}

export function signShareToken(payload: ShareTokenPayload) {
  const header = { alg: 'HS256', typ: 'JWT' }
  const encodedHeader = base64UrlEncode(JSON.stringify(header))
  const encodedPayload = base64UrlEncode(JSON.stringify(payload))
  const signature = sign(`${encodedHeader}.${encodedPayload}`)
  return `${encodedHeader}.${encodedPayload}.${signature}`
}

export function verifyShareToken(token: string): ShareTokenPayload | null {
  const parts = token.split('.')
  if (parts.length !== 3) return null

  const [encodedHeader, encodedPayload, givenSignature] = parts
  const expectedSignature = sign(`${encodedHeader}.${encodedPayload}`)
  if (givenSignature !== expectedSignature) return null

  try {
    const payload = JSON.parse(base64UrlDecode(encodedPayload)) as ShareTokenPayload
    if (!payload.exp || !payload.scopes || !payload.googleAccessToken) {
      return null
    }
    if (Date.now() >= payload.exp * 1000) {
      return null
    }
    return payload
  } catch {
    return null
  }
}
