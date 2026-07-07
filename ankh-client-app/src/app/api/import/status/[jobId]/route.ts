import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const { jobId } = await params

  if (!jobId) {
    return NextResponse.json({ error: 'jobId is required' }, { status: 400 })
  }

  const job = await prisma.importJob.findUnique({
    where: { id: jobId },
    select: {
      id: true,
      status: true,
      progress: true,
      message: true,
      totalRows: true,
      rowErrors: true,
      createdAt: true,
      updatedAt: true,
    },
  })

  if (!job) {
    return NextResponse.json({ error: 'Job not found' }, { status: 404 })
  }

  return NextResponse.json(job)
}