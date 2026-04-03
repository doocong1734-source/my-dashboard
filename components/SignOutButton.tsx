'use client'
import { signOut } from 'next-auth/react'

export function SignOutButton() {
  return (
    <button
      onClick={() => signOut({ callbackUrl: '/api/auth/signin' })}
      className="w-full border-2 border-black bg-white px-3 py-1.5 text-xs font-black text-black hover:bg-[#FF6B6B] hover:text-black transition-all"
    >
      LOGOUT
    </button>
  )
}
