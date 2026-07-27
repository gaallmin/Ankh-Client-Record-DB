import { NextResponse } from 'next/server'
import { clearClientSession } from '@/lib/clientAuth'

export async function POST() {
  return clearClientSession(NextResponse.json({ message: 'Logged out' }))
}
