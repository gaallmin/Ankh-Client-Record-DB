import { Prisma } from '@prisma/client'

export const RESERVATION_OVERLAP_CONSTRAINT = 'reservations_no_confirmed_instructor_overlap'

export function isReservationOverlapError(error: unknown): boolean {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === 'P2002') return true
    if (error.code === 'P2004' && String(error.meta?.database_error || '').includes(RESERVATION_OVERLAP_CONSTRAINT)) {
      return true
    }
  }

  const message = error instanceof Error ? error.message : String(error)
  return message.includes(RESERVATION_OVERLAP_CONSTRAINT) || message.includes('23P01')
}
