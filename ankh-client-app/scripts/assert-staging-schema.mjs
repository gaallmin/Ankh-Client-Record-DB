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

  const requiredColumns = [{ table: 'users', column: 'isActive' }]
  const columns = await prisma.$queryRawUnsafe(
    `SELECT table_name, column_name FROM information_schema.columns
     WHERE table_schema = 'public' AND (table_name, column_name) IN (${requiredColumns.map((_, index) => `($${index * 2 + 1}, $${index * 2 + 2})`).join(', ')})`,
    ...requiredColumns.flatMap(({ table, column }) => [table, column]),
  )
  const presentColumns = new Set(columns.map(column => `${column.table_name}.${column.column_name}`))
  const missingColumns = requiredColumns
    .map(({ table, column }) => `${table}.${column}`)
    .filter(column => !presentColumns.has(column))

  if (missingColumns.length > 0) {
    throw new Error(`Staging migration verification failed; missing public columns: ${missingColumns.join(', ')}`)
  }

  console.log(`Staging schema verified: ${requiredTables.join(', ')}; users.isActive`)
} finally {
  await prisma.$disconnect()
}
