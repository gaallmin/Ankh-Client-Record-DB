import { PrismaClient } from '@prisma/client'

if (!process.env.TEST_DATABASE_URL?.trim()) {
  throw new Error('TEST_DATABASE_URL is required to verify the migrated staging schema')
}

const prisma = new PrismaClient({ datasourceUrl: process.env.TEST_DATABASE_URL })
const requiredTables = ['users', 'customers', 'client_accounts', 'reservations', 'notifications']

try {
  const rows = await prisma.$queryRawUnsafe(
    `SELECT table_name FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name IN (${requiredTables.map((_, index) => `$${index + 1}`).join(', ')})`,
    ...requiredTables,
  )
  const present = new Set(rows.map(row => row.table_name))
  const missing = requiredTables.filter(table => !present.has(table))

  if (missing.length > 0) {
    throw new Error(`Staging migration verification failed; missing public tables: ${missing.join(', ')}`)
  }

  console.log(`Staging schema verified: ${requiredTables.join(', ')}`)
} finally {
  await prisma.$disconnect()
}
