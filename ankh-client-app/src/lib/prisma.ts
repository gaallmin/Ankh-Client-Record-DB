import { PrismaClient } from '@/generated/prisma'

declare global {
  var prisma: PrismaClient | undefined
}

export const prisma =
  global.prisma ??
  new PrismaClient({
    log:
      process.env.NODE_ENV === 'development'
        ? ['error', 'warn']
        : ['error']
  })

if (process.env.NODE_ENV !== 'production') global.prisma = prisma

export default prisma
