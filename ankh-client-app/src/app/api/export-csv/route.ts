import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireStaff } from '@/lib/staffAuth'

const csvEscape = (value: unknown) => {
  const s = (value ?? '').toString()
  // Escape if contains comma, quote, or newline
  if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

export async function GET(request: NextRequest) {
  const auth = requireStaff(request)
  if ('error' in auth) return auth.error

  try {
    if (auth.role === 'INSTRUCTOR') {
      const row = await prisma.appSettings.findUnique({ where: { id: 'singleton' } })
      const settings = row?.settings as { allowInstructorExport?: boolean } | null
      if (settings?.allowInstructorExport === false) {
        return NextResponse.json({ error: 'Export is disabled for instructors' }, { status: 403 })
      }
    }

    const [lessonParticipants, initialSymptomRecords] = await Promise.all([
      prisma.lessonParticipant.findMany({
        where: { customer: { deletedAt: null } },
        orderBy: { lesson: { createdAt: 'desc' } },
        select: {
          customer: {
            select: {
              id: true,
              externalId: true,
              firstName: true,
              lastName: true
            }
          },
          lesson: {
            select: {
              id: true,
              lessonType: true,
              lessonContent: true,
              createdAt: true,
              instructor: { select: { firstName: true, lastName: true } },
              location: { select: { name: true } }
            }
          },
          customerSymptoms: true,
          customerImprovements: true,
          notes: true,
          status: true
        }
      }),
      // Initial symptom = oldest lesson's customerSymptoms per customer
      prisma.lessonParticipant.findMany({
        where: { customer: { deletedAt: null }, customerSymptoms: { not: null } },
        orderBy: { lesson: { createdAt: 'asc' } },
        distinct: ['customerId'],
        select: { customerId: true, customerSymptoms: true }
      })
    ])

    const initialSymptomMap = new Map(
      initialSymptomRecords.map(r => [r.customerId, r.customerSymptoms ?? ''])
    )

    const headers = [
      'Lesson Date',
      'Customer Name',
      'Instructor Name',
      'Lesson Location',
      'Customer Improvements',
      'Lesson Content',
      'Attendance Status',
      'Special Notes / Requests',
      'Lesson Type',
      'Customer Symptoms',
      'Initial Symptom',
      'Customer ID',
      'Lesson ID'
    ]

    const rows = lessonParticipants.map(p => {
      const customerName = `${p.customer.firstName} ${p.customer.lastName}`.trim()
      const instructorName = p.lesson.instructor
        ? `${p.lesson.instructor.firstName} ${p.lesson.instructor.lastName}`.trim()
        : ''
      const lessonDate = p.lesson.createdAt
        ? new Date(p.lesson.createdAt).toISOString().slice(0, 10)
        : ''

      return [
        lessonDate,
        customerName,
        instructorName,
        p.lesson.location?.name || '',
        p.customerImprovements || '',
        p.lesson.lessonContent || '',
        p.status || '',
        p.notes || '',
        p.lesson.lessonType || '',
        p.customerSymptoms || '',
        initialSymptomMap.get(p.customer.id) || '',
        p.customer.externalId ?? p.customer.id,
        p.lesson.id
      ].map(csvEscape).join(',')
    })

    // UTF-8 BOM (\uFEFF) ensures Excel opens Korean characters correctly
    const csvContent = '\uFEFF' + [headers.join(','), ...rows].join('\n')

    const response = new NextResponse(csvContent)
    response.headers.set('Content-Type', 'text/csv; charset=utf-8')
    response.headers.set(
      'Content-Disposition',
      'attachment; filename="customer_records.csv"'
    )
    response.headers.set('Cache-Control', 'private, no-store')
    return response

  } catch (error) {
    console.error('CSV export error:', error)
    return NextResponse.json(
      { error: 'Internal server error during CSV export' },
      { status: 500 }
    )
  }
}
