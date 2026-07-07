import { NextRequest, NextResponse } from 'next/server'
import jwt from 'jsonwebtoken'
import { prisma } from '@/lib/prisma'

const JWT_SECRET = process.env.JWT_SECRET || 'your_fallback_secret_for_dev_only'

export const DEFAULT_SETTINGS = {
  // User Experience
  defaultLessonType: 'Group',
  nameDisplayOrder: 'lastFirst',   // 'lastFirst' | 'firstLast'
  recordsPerPage: 20,
  // Feature Management
  allowInstructorExport: true,
  showInitialSymptoms: true,
  requireLessonContent: false,
  showFeedbackBadge: true,
  showCustomerPhone: true,
}

export type AppSettingsData = typeof DEFAULT_SETTINGS

// GET — public, no auth required (settings need to be readable by all logged-in users)
export async function GET() {
  try {
    const row = await prisma.appSettings.findUnique({ where: { id: 'singleton' } })
    const settings = row ? { ...DEFAULT_SETTINGS, ...(row.settings as object) } : DEFAULT_SETTINGS
    return NextResponse.json({ settings })
  } catch (error) {
    console.error('Error fetching settings:', error)
    return NextResponse.json({ settings: DEFAULT_SETTINGS })
  }
}

// PATCH — manager only
export async function PATCH(request: NextRequest) {
  const authHeader = request.headers.get('authorization') || ''
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { role?: string }
    if (decoded.role !== 'MANAGER') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  } catch {
    return NextResponse.json({ error: 'Invalid token' }, { status: 401 })
  }

  try {
    const { settings } = await request.json()
    const row = await prisma.appSettings.upsert({
      where: { id: 'singleton' },
      update: { settings },
      create: { id: 'singleton', settings },
    })
    return NextResponse.json({ settings: { ...DEFAULT_SETTINGS, ...(row.settings as object) } })
  } catch (error) {
    console.error('Error saving settings:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
