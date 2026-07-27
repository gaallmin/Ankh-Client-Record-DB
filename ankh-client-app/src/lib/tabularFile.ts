import Papa from 'papaparse'
import { readSheet } from 'read-excel-file/node'

type TabularRow = Record<string, unknown>

async function parseXlsx(file: File): Promise<TabularRow[]> {
  const worksheet = await readSheet(Buffer.from(await file.arrayBuffer()))
  const [headerRow = [], ...dataRows] = worksheet
  const headers = headerRow.map((value) => String(value ?? '').trim())

  return dataRows.flatMap((row) => {
    const result: TabularRow = {}
    let hasValue = false

    headers.forEach((header, column) => {
      if (!header) return
      const value = row[column] ?? ''
      result[header] = value
      if (value !== '') hasValue = true
    })

    return hasValue ? [result] : []
  })
}

async function parseCsv(file: File): Promise<TabularRow[]> {
  const result = Papa.parse<TabularRow>(await file.text(), {
    header: true,
    skipEmptyLines: 'greedy',
    transformHeader: (header) => header.trim(),
  })

  if (result.errors.length > 0) {
    const first = result.errors[0]
    throw new Error(`Invalid CSV at row ${first.row ?? 'unknown'}: ${first.message}`)
  }

  return result.data
}

export async function parseTabularFile(file: File): Promise<TabularRow[]> {
  const extension = file.name.split('.').pop()?.toLowerCase()
  if (extension === 'csv') return parseCsv(file)
  if (extension === 'xlsx') return parseXlsx(file)
  throw new Error('File must be CSV (.csv) or Excel (.xlsx) format')
}
