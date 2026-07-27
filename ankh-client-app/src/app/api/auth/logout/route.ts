import { NextResponse } from 'next/server'
import { clearStaffSessionCookie } from '@/lib/staffAuth'

export async function POST() {
  const response = NextResponse.json({ message: 'Logged out' })
  clearStaffSessionCookie(response)
  return response
}
