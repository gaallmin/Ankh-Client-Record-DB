import { PrismaClient } from '@prisma/client'

declare global {
  var prisma: PrismaClient | undefined
}

const testDatasourceUrl = process.env.NODE_ENV === 'test' ? process.env.TEST_DATABASE_URL : undefined

export const prisma = global.prisma ?? new PrismaClient({
  ...(testDatasourceUrl ? { datasourceUrl: testDatasourceUrl } : {}),
  log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
})

if (process.env.NODE_ENV !== 'production') global.prisma = prisma

export default prisma
