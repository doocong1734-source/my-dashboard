import { NextAuthOptions } from 'next-auth'
import GoogleProvider from 'next-auth/providers/google'

type RefreshTokenResponse = {
  access_token: string
  expires_in: number
  refresh_token?: string
}

async function refreshGoogleAccessToken(token: {
  refreshToken?: string
  accessToken?: string
  expiresAt?: number
}) {
  if (!token.refreshToken) {
    return { ...token, error: 'RefreshTokenError' as const }
  }

  try {
    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID || '',
        client_secret: process.env.GOOGLE_CLIENT_SECRET || '',
        grant_type: 'refresh_token',
        refresh_token: token.refreshToken,
      }),
    })

    const refreshedTokens = (await response.json()) as RefreshTokenResponse
    if (!response.ok || !refreshedTokens.access_token || !refreshedTokens.expires_in) {
      return { ...token, error: 'RefreshTokenError' as const }
    }

    return {
      ...token,
      accessToken: refreshedTokens.access_token,
      expiresAt: Math.floor(Date.now() / 1000 + refreshedTokens.expires_in),
      refreshToken: refreshedTokens.refresh_token ?? token.refreshToken,
      error: undefined,
    }
  } catch {
    return { ...token, error: 'RefreshTokenError' as const }
  }
}

export const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      authorization: {
        params: {
          scope: 'openid email profile https://www.googleapis.com/auth/drive https://www.googleapis.com/auth/calendar.readonly',
          access_type: 'offline',
          prompt: 'consent',
        },
      },
    }),
  ],
  callbacks: {
    async jwt({ token, account }) {
      if (account) {
        token.accessToken = account.access_token
        token.refreshToken = account.refresh_token
        token.expiresAt = account.expires_at
        token.error = undefined
        return token
      }

      if (!token.expiresAt || Date.now() < token.expiresAt * 1000 - 60_000) {
        return token
      }

      return refreshGoogleAccessToken(token)

    },
    async session({ session, token }) {
      session.accessToken = token.accessToken
      session.error = token.error
      return session
    },
  },
}
