import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@/generated/prisma'
import { Client } from '@upstash/qstash'
import bcrypt from 'bcryptjs'
import * as XLSX from 'xlsx'

const HEADER_MAP: Record<string, string> = {
  'customer id': 'customerId', 'customerid': 'customerId',
  'customer name': 'customerName', 'customername': 'customerName',
  'lesson id': 'lessonId', 'lessonid': 'lessonId',
  'lesson date': 'lessonDate', 'lessondate': 'lessonDate', 'date': 'lessonDate',
  'instructor name': 'instructorName', 'instructorname': 'instructorName', 'instructor': 'instructorName',
  'lesson location': 'locationName', 'lessonlocation': 'locationName',
  'location name': 'locationName', 'locationname': 'locationName', 'location': 'locationName',
  'lesson type': 'lessonType', 'lessontype': 'lessonType',
  'lesson content': 'lessonContent', 'lessoncontent': 'lessonContent', 'content': 'lessonContent',
  'customer symptoms': 'customerSymptoms', 'customersymptoms': 'customerSymptoms', 'symptoms': 'customerSymptoms',
  'initial symptom': 'initialSymptom', 'initialsymptom': 'initialSymptom',
  'customer improvements': 'customerImprovements', 'customerimprovements': 'customerImprovements',
  'course completion status': 'customerFeedback', 'coursecompletionstatus': 'customerFeedback',
  'customer feedback': 'customerFeedback', 'customerfeedback': 'customerFeedback',
}

function safeDate(val: unknown): Date | undefined {
  if (!val) return undefined
  if (val instanceof Date) return isNaN(val.getTime()) ? undefined : val
  if (typeof val === 'number' && val > 30000 && val < 99999) {
    // Excel serial number → JS date
    const d = new Date((val - 25569) * 86400 * 1000)
    return isNaN(d.getTime()) ? undefined : d
  }
  if (typeof val === 'string' && val.trim()) {
    const s = val.trim()
    // Handle DD/MM/YYYY, DD/MM/YY, DD/M/YYYY, DD/M/YY (Korean Excel format)
    const dmy = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/)
    if (dmy) {
      let year = parseInt(dmy[3])
      if (year < 100) year += 2000  // 26 → 2026
      const d = new Date(year, parseInt(dmy[2]) - 1, parseInt(dmy[1]))
      return isNaN(d.getTime()) ? undefined : d
    }

    //fallback
    const d = new Date(s)
    return isNaN(d.getTime()) ? undefined : d
  }
  return undefined
}

// Extract an ISO date string (YYYY-MM-DD) from any raw cell value for stable lessonId generation
function rawToDatePart(val: unknown): string {
  if (!val) return 'nodate'
  if (val instanceof Date && !isNaN(val.getTime())) return val.toISOString().slice(0, 10)
  if (typeof val === 'number' && val > 30000 && val < 99999) {
    const d = new Date((val - 25569) * 86400 * 1000)
    return isNaN(d.getTime()) ? 'nodate' : d.toISOString().slice(0, 10)
  }
  if (typeof val === 'string') {
    const s = val.trim()
    const dmy = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/)
    if (dmy) {
      let year = parseInt(dmy[3])
      if (year < 100) year += 2000
      const d = new Date(year, parseInt(dmy[2]) - 1, parseInt(dmy[1]))
      return isNaN(d.getTime()) ? 'nodate' : d.toISOString().slice(0, 10)
    }
    const d = new Date(s)
    return isNaN(d.getTime()) ? 'nodate' : d.toISOString().slice(0, 10)
  }
  return 'nodate'
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get('file') as File | null
    if (!file) return NextResponse.json({ error: 'No file uploaded' }, { status: 400 })

    const ext = file.name.split('.').pop()?.toLowerCase()
    if (!['csv', 'xlsx', 'xls'].includes(ext || '')) {
      return NextResponse.json({ error: 'File must be CSV, XLSX, or XLS' }, { status: 400 })
    }

    // ── 1. Parse file ─────────────────────────────────────────────────────────
    const buffer = await file.arrayBuffer()
    const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true })
    const sheet = workbook.Sheets[workbook.SheetNames[0]]
    const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { raw: true })

    if (rawRows.length === 0) return NextResponse.json({ error: 'File is empty' }, { status: 400 })

    // ── 2. Normalize rows ─────────────────────────────────────────────────────
    type NRow = {
      customerId: string; customerName: string; lessonId: string
      lessonDate: Date | undefined; instructorName: string; lessonType: string
      locationName: string; lessonContent: string | null
      customerSymptoms: string | null; initialSymptom: string | null
      customerImprovements: string | null; customerFeedback: string | null
    }

    const rows: NRow[] = []
    for (const raw of rawRows) {
      const norm: Record<string, unknown> = {}
      for (const [k, v] of Object.entries(raw)) {
        const key = k.toLowerCase().trim().replace(/\s+/g, ' ')
        const canonical = HEADER_MAP[key]
        if (canonical) norm[canonical] = v
      }
      // Auto-generate customerId from customer name if absent
      if (!norm.customerId) {
        const name = String(norm.customerName || '').trim()
        if (!name) continue // skip rows with no identifiable customer
        norm.customerId = 'cust_' + name.replace(/\s+/g, '_')
      }
      // Auto-generate lessonId from key fields if absent
      if (!norm.lessonId) {
        const datePart = rawToDatePart(norm.lessonDate)
        const instPart = String(norm.instructorName || 'noinstructor').replace(/\s+/g, '_')
        const typePart = String(norm.lessonType || 'Group').replace(/\s+/g, '_')
        const locPart  = String(norm.locationName  || 'Default').replace(/\s+/g, '_')
        norm.lessonId = `lesson_${datePart}_${instPart}_${typePart}_${locPart}`
      }
      rows.push({
        customerId: String(norm.customerId).trim(),
        customerName: String(norm.customerName || '').trim(),
        lessonId: String(norm.lessonId).trim(),
        lessonDate: safeDate(norm.lessonDate),
        instructorName: String(norm.instructorName || '').trim(),
        lessonType: String(norm.lessonType || 'Group').trim(),
        locationName: String(norm.locationName || 'Default Location').trim(),
        lessonContent: norm.lessonContent ? String(norm.lessonContent).trim() : null,
        customerSymptoms: norm.customerSymptoms ? String(norm.customerSymptoms).trim() : null,
        initialSymptom: norm.initialSymptom ? String(norm.initialSymptom).trim() : null,
        customerImprovements: norm.customerImprovements ? String(norm.customerImprovements).trim() : null,
        customerFeedback: norm.customerFeedback ? String(norm.customerFeedback).trim() : null,
      })
    }

    if (rows.length === 0) {
      return NextResponse.json({ error: 'No valid rows found — check column headers' }, { status: 400 })
    }

    // ── 3. Create job record ──────────────────────────────────────────────────
    const job = await prisma.importJob.create({
      data: {
        status: 'processing',
        progress: 5,
        message: `Uploading ${rows.length} rows…`,
        totalRows: rows.length,
        rowErrors: [],
        rowsJson: null, // We do NOT store rows in DB anymore
      },
    })

    // ── 4. Do refs synchronously here — fast, <5 seconds ─────────────────────
    await prisma.importJob.update({ where: { id: job.id }, data: { progress: 8, message: 'Setting up locations…' } })

    const locationNames = [...new Set(rows.map(r => r.locationName))]
    await prisma.location.createMany({
      data: locationNames.map(name => ({ name })),
      skipDuplicates: true,
    })

    await prisma.importJob.update({ where: { id: job.id }, data: { progress: 16, message: 'Setting up instructors…' } })

    const hashedPw = await bcrypt.hash('DefaultPass123!', 10)
    const uniqueInstructors = new Map<string, string>()
    for (const row of rows) {
      if (!row.instructorName) continue
      const email = `${row.instructorName.replace(/\s+/g, '.').toLowerCase()}@instructor.local`
      uniqueInstructors.set(email, row.instructorName)
    }
    await prisma.user.createMany({
      data: [...uniqueInstructors.entries()].map(([email, name]) => {
        const parts = name.split(/\s+/)
        return { username: email, password: hashedPw, role: 'INSTRUCTOR' as const, firstName: parts[0] || name, lastName: parts.slice(1).join(' ') || '', email }
      }),
      skipDuplicates: true,
    })

    await prisma.importJob.update({ where: { id: job.id }, data: { progress: 24, message: 'Importing customers…' } })

    // Customer resolution order:
    // 0. externalId match + name matches → strongest signal, use that DB customer
    // 1. Source ID == DB ID AND name matches → direct hit
    // 2. Source ID in DB but name differs → ID was recycled; fall back to name lookup
    // 3. Name lookup: if ≥1 match, pick the one with the most lesson history (canonical)
    // 4. No match at all → create a new customer (stores externalId for future imports)
    const sourceIds = [...new Set(rows.map(r => r.customerId))]
    const [existingByExtId, existingById, allExistingCustomers, participantCounts] = await Promise.all([
      prisma.customer.findMany({
        where: { externalId: { in: sourceIds }, deletedAt: null },
        select: { id: true, externalId: true, firstName: true, lastName: true },
      }),
      prisma.customer.findMany({
        where: { id: { in: sourceIds }, deletedAt: null },
        select: { id: true, firstName: true, lastName: true },
      }),
      prisma.customer.findMany({
        where: { deletedAt: null },
        select: { id: true, firstName: true, lastName: true },
      }),
      prisma.lessonParticipant.groupBy({
        by: ['customerId'],
        _count: { customerId: true },
      }),
    ])

    // externalId → customer (Rule 0 lookup)
    const extIdToCustomer = new Map(existingByExtId.map(c => [c.externalId!, c]))
    const idToDbCustomer = new Map(existingById.map(c => [c.id, c]))
    const existingIdSet = new Set(allExistingCustomers.map(c => c.id))
    const lessonCountByCustomer = new Map(participantCounts.map(p => [p.customerId, p._count.customerId]))

    // name → list of DB customer IDs (may be >1 due to past duplicate imports)
    const nameToDbList = new Map<string, string[]>()
    for (const c of allExistingCustomers) {
      const nk = `${c.firstName}${c.lastName}`.toLowerCase().replace(/\s+/g, '')
      if (!nameToDbList.has(nk)) nameToDbList.set(nk, [])
      nameToDbList.get(nk)!.push(c.id)
    }

    // When multiple customers share a name, return the one with the most lesson history.
    function pickCanonical(ids: string[]): string {
      return ids.reduce((best, id) =>
        (lessonCountByCustomer.get(id) ?? 0) >= (lessonCountByCustomer.get(best) ?? 0) ? id : best
      )
    }

    const resolveCache = new Map<string, string>()
    function pickDbId(sourceId: string, nameKey: string): string {
      const cacheKey = `${sourceId}|${nameKey}`
      if (resolveCache.has(cacheKey)) return resolveCache.get(cacheKey)!
      let result: string
      // Rule 0: externalId stored from a previous import — strongest signal
      const byExt = extIdToCustomer.get(sourceId)
      if (byExt && `${byExt.firstName}${byExt.lastName}`.toLowerCase().replace(/\s+/g, '') === nameKey) {
        result = byExt.id
      } else {
        // Rule 1: DB primary key matches source ID and name agrees
        const byId = idToDbCustomer.get(sourceId)
        if (byId && `${byId.firstName}${byId.lastName}`.toLowerCase().replace(/\s+/g, '') === nameKey) {
          result = sourceId
        } else {
          // Rules 2 & 3: name lookup — pick canonical when multiple exist
          const matches = nameToDbList.get(nameKey) ?? []
          result = matches.length >= 1
            ? pickCanonical(matches)
            : `imp_${sourceId}_${nameKey.slice(0, 20)}` // Rule 4: genuinely new customer
        }
      }
      resolveCache.set(cacheKey, result)
      return result
    }

    // Clean up imp_ customers created by a previous buggy import run.
    // Migrate their lesson participants to the canonical customer, then soft-delete them.
    const impCustomers = allExistingCustomers.filter(c => c.id.startsWith('imp_'))
    for (const impCust of impCustomers) {
      const nk = `${impCust.firstName}${impCust.lastName}`.toLowerCase().replace(/\s+/g, '')
      const nonImpMatches = (nameToDbList.get(nk) ?? []).filter(id => !id.startsWith('imp_'))
      if (nonImpMatches.length === 0) continue
      const canonical = pickCanonical(nonImpMatches)
      const existingOnCanonical = new Set(
        (await prisma.lessonParticipant.findMany({
          where: { customerId: canonical },
          select: { lessonId: true },
        })).map(p => p.lessonId)
      )
      await prisma.lessonParticipant.updateMany({
        where: { customerId: impCust.id, lessonId: { notIn: [...existingOnCanonical] } },
        data: { customerId: canonical },
      })
      await prisma.customer.update({ where: { id: impCust.id }, data: { deletedAt: new Date() } })
    }

    // Create customers whose name is completely absent from the DB
    const toCreate: Array<{ id: string; externalId: string; firstName: string; lastName: string; email: string }> = []
    const seenNewIds = new Set<string>()
    for (const row of rows) {
      if (!row.customerName.trim()) continue
      const nameKey = row.customerName.toLowerCase().replace(/\s+/g, '')
      const dbId = pickDbId(row.customerId, nameKey)
      if (!existingIdSet.has(dbId) && !seenNewIds.has(dbId)) {
        seenNewIds.add(dbId)
        const parts = row.customerName.split(/\s+/)
        toCreate.push({
          id: dbId,
          externalId: row.customerId,
          firstName: parts[0] || 'Unknown',
          lastName: parts.slice(1).join(' ') || '',
          email: `customer_${dbId}@imported.local`,
        })
      }
    }
    if (toCreate.length > 0) {
      await prisma.customer.createMany({ data: toCreate, skipDuplicates: true })
    }

    // Rewrite every row's customerId to the resolved DB ID.
    // Simultaneously count how often each sourceId maps to each DB customer — the most
    // common sourceId wins as the externalId (handles stray rows with wrong IDs).
    const externalIdCounts = new Map<string, Map<string, number>>() // dbId → (sourceId → count)
    for (const row of rows) {
      if (!row.customerName.trim()) continue
      const nameKey = row.customerName.toLowerCase().replace(/\s+/g, '')
      const sourceId = row.customerId
      const dbId = pickDbId(sourceId, nameKey)
      row.customerId = dbId
      if (!externalIdCounts.has(dbId)) externalIdCounts.set(dbId, new Map())
      const counts = externalIdCounts.get(dbId)!
      counts.set(sourceId, (counts.get(sourceId) ?? 0) + 1)
    }
    // Pick the most-frequent sourceId per customer and persist — always overwrite so
    // a re-import with a corrected file fixes previously wrong externalIds.
    if (externalIdCounts.size > 0) {
      const externalIdUpdates = [...externalIdCounts.entries()].map(([dbId, counts]) => {
        const bestSourceId = [...counts.entries()].reduce((a, b) => b[1] > a[1] ? b : a)[0]
        return [dbId, bestSourceId] as [string, string]
      })
      const values = Prisma.join(
        externalIdUpdates.map(([dbId, sourceId]) => Prisma.sql`(${dbId}, ${sourceId})`),
        ','
      )
      await prisma.$executeRaw`
        UPDATE customers
        SET "externalId" = v.source_id
        FROM (VALUES ${values}) AS v(db_id, source_id)
        WHERE customers.id = v.db_id
      `
    }

    // ── 5. Fetch IDs and build lesson + participant data ───────────────────────
    const [instructorRecords, locationRecords] = await Promise.all([
      prisma.user.findMany({ where: { email: { in: [...uniqueInstructors.keys()] } }, select: { id: true, email: true } }),
      prisma.location.findMany({ where: { name: { in: locationNames } }, select: { id: true, name: true } }),
    ])
    const instructorIdByEmail = Object.fromEntries(instructorRecords.map(u => [u.email, u.id]))
    const locationIdByName = Object.fromEntries(locationRecords.map(l => [l.name, l.id]))

    // Build minimal lesson rows (only what DB needs, no text content)
    type LessonRow = { id: string; lessonType: string; lessonContent: string | null; instructorId: string; locationId: string; createdAt?: Date }
    type ParticipantRow = { customerId: string; lessonId: string; customerSymptoms: string | null; customerImprovements: string | null; status: string }

    const lessonRows: LessonRow[] = []
    const seenLessons = new Set<string>()
    const participantRows: ParticipantRow[] = []

    for (const row of rows) {
      const email = `${row.instructorName.replace(/\s+/g, '.').toLowerCase()}@instructor.local`
      const instructorId = instructorIdByEmail[email]
      const locationId = locationIdByName[row.locationName]
      if (!instructorId || !locationId) continue

      if (!seenLessons.has(row.lessonId)) {
        seenLessons.add(row.lessonId)
        const lessonRow: LessonRow = {
          id: row.lessonId,
          lessonType: row.lessonType,
          lessonContent: row.lessonContent,
          instructorId,
          locationId,
        }
        if (row.lessonDate) lessonRow.createdAt = row.lessonDate
        lessonRows.push(lessonRow)
      }

      participantRows.push({
        customerId: row.customerId,
        lessonId: row.lessonId,
        customerSymptoms: row.customerSymptoms || row.initialSymptom,
        customerImprovements: row.customerImprovements,
        status: row.customerFeedback || 'attended',
      })
    }

    // ── 6. Store ONLY lesson + participant data in DB (much smaller) ──────────
    // lessonRows: ~200 bytes each vs 907 bytes for full rows
    // participantRows: ~150 bytes each
    await prisma.importJob.update({
      where: { id: job.id },
      data: {
        progress: 30,
        message: `References done — importing ${lessonRows.length} lessons…`,
        rowsJson: JSON.stringify({ lessons: lessonRows, participants: participantRows }),
      },
    })

    // ── 7. Queue first lesson chunk ───────────────────────────────────────────
    const qstash = new Client({ baseUrl: process.env.QSTASH_URL!, token: process.env.QSTASH_TOKEN! })
    await qstash.publishJSON({
      url: `${process.env.NEXT_PUBLIC_APP_URL!}/api/import/process`,
      body: { jobId: job.id, phase: 'lessons', chunkIndex: 0 },
      retries: 2,
    })

    return NextResponse.json({ jobId: job.id, totalRows: rows.length, message: 'Import started' })

  } catch (error) {
    console.error('Import start error:', error)
    return NextResponse.json({ error: 'Failed to start import', detail: String(error) }, { status: 500 })
  }
}