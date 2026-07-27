import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireManager } from '@/lib/staffAuth'

export async function GET(request: NextRequest) {
  const auth = requireManager(request)
  if ('error' in auth) return auth.error

  try {
    await prisma.$queryRaw`SELECT 1`
    return NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (error) {
    console.error('Database health check failed:', error)
    return NextResponse.json({ ok: false, error: 'Database unavailable' }, { status: 503 })
  }
}
