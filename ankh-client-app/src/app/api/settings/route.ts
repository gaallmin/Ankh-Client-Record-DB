import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireManager, requireStaff } from '@/lib/staffAuth'


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

// GET — staff only. These settings control staff-only application behaviour.
export async function GET(request: NextRequest) {
  const auth = requireStaff(request)
  if ('error' in auth) return auth.error

  try {
    const row = await prisma.appSettings.findUnique({ where: { id: 'singleton' } })
    const settings = row ? { ...DEFAULT_SETTINGS, ...(row.settings as object) } : DEFAULT_SETTINGS
    return NextResponse.json({ settings }, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (error) {
    console.error('Error fetching settings:', error)
    return NextResponse.json({ settings: DEFAULT_SETTINGS })
  }
}

// PATCH — manager only
export async function PATCH(request: NextRequest) {
  const auth = requireManager(request)
  if ('error' in auth) return auth.error

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
