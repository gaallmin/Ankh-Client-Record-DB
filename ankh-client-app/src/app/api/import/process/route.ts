import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@/generated/prisma'
import { verifySignatureAppRouter } from '@upstash/qstash/nextjs'
import { Client } from '@upstash/qstash'

const CHUNK_SIZE = 1000

type Phase = 'lessons' | 'participants'
interface ProcessPayload { jobId: string; phase: Phase; chunkIndex: number }

type LessonRow = {
  id: string; lessonType: string; lessonContent: string | null
  instructorId: string; locationId: string; createdAt?: string
}
type ParticipantRow = {
  customerId: string; lessonId: string
  customerSymptoms: string | null; customerImprovements: string | null; status: string
}
interface StoredData { lessons: LessonRow[]; participants: ParticipantRow[] }

async function setProgress(jobId: string, progress: number, message: string) {
  await prisma.importJob.update({ where: { id: jobId }, data: { progress, message, status: 'processing' } })
}

async function queueNext(payload: ProcessPayload) {
  const qstash = new Client({ baseUrl: process.env.QSTASH_URL!, token: process.env.QSTASH_TOKEN! })
  await qstash.publishJSON({
    url: `${process.env.NEXT_PUBLIC_APP_URL!}/api/import/process`,
    body: payload,
    retries: 2,
  })
}

async function handler(request: NextRequest) {
  let payload: ProcessPayload
  try { payload = await request.json() }
  catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  const { jobId, phase, chunkIndex } = payload
  if (!jobId || !phase) return NextResponse.json({ error: 'Missing jobId or phase' }, { status: 400 })

  try {
    const job = await prisma.importJob.findUnique({
      where: { id: jobId },
      select: { rowsJson: true, status: true, totalRows: true },
    })

    if (!job) return NextResponse.json({ error: 'Job not found' }, { status: 404 })
    if (job.status === 'complete') return NextResponse.json({ ok: true, skipped: 'already complete' })
    if (job.status === 'failed') return NextResponse.json({ ok: true, skipped: 'already failed' })

    const data: StoredData = JSON.parse(job.rowsJson as string || '{"lessons":[],"participants":[]}')
    const { lessons, participants } = data
    const totalRows = job.totalRows

    if (phase === 'lessons') {
      const totalChunks = Math.ceil(lessons.length / CHUNK_SIZE)
      const chunk = lessons.slice(chunkIndex * CHUNK_SIZE, (chunkIndex + 1) * CHUNK_SIZE)

      const pct = 30 + Math.floor(((chunkIndex + 1) / totalChunks) * 25)
      await setProgress(
        jobId, Math.min(pct, 54),
        `Importing lessons… (${Math.min((chunkIndex + 1) * CHUNK_SIZE, lessons.length)} / ${lessons.length})`
      )

      // Single bulk upsert — one DB round-trip for the entire chunk
      const values = Prisma.join(
        chunk.map(l =>
          Prisma.sql`(
            ${l.id},
            ${l.lessonType},
            ${l.lessonContent ?? null},
            ${l.instructorId},
            ${l.locationId},
            ${l.createdAt ? new Date(l.createdAt) : new Date()},
            NOW()
          )`
        ),
        ','
      )
      await prisma.$executeRaw`
        INSERT INTO lessons (id, "lessonType", "lessonContent", "instructorId", "locationId", "createdAt", "updatedAt")
        VALUES ${values}
        ON CONFLICT (id) DO UPDATE SET
          "lessonType"    = EXCLUDED."lessonType",
          "lessonContent" = EXCLUDED."lessonContent",
          "instructorId"  = EXCLUDED."instructorId",
          "locationId"    = EXCLUDED."locationId",
          "createdAt"     = EXCLUDED."createdAt",
          "updatedAt"     = NOW()
      `

      const isLast = chunkIndex + 1 >= totalChunks
      if (isLast) {
        await setProgress(jobId, 55, `Lessons done — linking ${participants.length} participants…`)
        await queueNext({ jobId, phase: 'participants', chunkIndex: 0 })
      } else {
        await queueNext({ jobId, phase: 'lessons', chunkIndex: chunkIndex + 1 })
      }

    } else if (phase === 'participants') {
      const totalChunks = Math.ceil(participants.length / CHUNK_SIZE)
      const chunk = participants.slice(chunkIndex * CHUNK_SIZE, (chunkIndex + 1) * CHUNK_SIZE)

      const pct = 55 + Math.floor(((chunkIndex + 1) / totalChunks) * 43)
      await setProgress(
        jobId, Math.min(pct, 98),
        `Linking customers to lessons… (${Math.min((chunkIndex + 1) * CHUNK_SIZE, participants.length)} / ${participants.length})`
      )

      await prisma.lessonParticipant.createMany({
        data: chunk.map(p => ({
          customerId: p.customerId,
          lessonId: p.lessonId,
          customerSymptoms: p.customerSymptoms,
          customerImprovements: p.customerImprovements,
          status: p.status || 'attended',
        })),
        skipDuplicates: true,
      })

      const isLast = chunkIndex + 1 >= totalChunks
      if (isLast) {
        await prisma.importJob.update({
          where: { id: jobId },
          data: {
            status: 'complete', progress: 100,
            message: `Successfully imported ${totalRows} records`,
            rowsJson: null,
          },
        })
      } else {
        await queueNext({ jobId, phase: 'participants', chunkIndex: chunkIndex + 1 })
      }
    }

    return NextResponse.json({ ok: true, phase, chunkIndex })

  } catch (error) {
    console.error(`Import failed [${phase} chunk ${chunkIndex}]:`, error)
    await prisma.importJob.update({
      where: { id: jobId },
      data: { status: 'failed', message: `Failed at ${phase} chunk ${chunkIndex}: ${String(error)}` },
    }).catch(() => {})
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}

export const POST = verifySignatureAppRouter(handler)