const required = [
  'STAGING_DATABASE_URL',
  'STAGING_DIRECT_URL',
  'STAGING_PROJECT_REF',
  'PRODUCTION_PROJECT_REF',
]

for (const name of required) {
  if (!process.env[name]?.trim()) {
    throw new Error(`${name} is required; refusing to operate without an explicit staging identity`)
  }
}

const stagingRef = process.env.STAGING_PROJECT_REF.trim()
const productionRef = process.env.PRODUCTION_PROJECT_REF.trim()

if (stagingRef === productionRef) {
  throw new Error('STAGING_PROJECT_REF must not equal PRODUCTION_PROJECT_REF')
}
if (/placeholder|project_ref|your_/i.test(stagingRef) || /placeholder|project_ref|your_/i.test(productionRef)) {
  throw new Error('Replace placeholder project references before running staging database operations')
}

function verifyUrl(name, raw) {
  let parsed
  try {
    parsed = new URL(raw)
  } catch {
    throw new Error(`${name} is not a valid PostgreSQL URL`)
  }
  if (!['postgres:', 'postgresql:'].includes(parsed.protocol)) {
    throw new Error(`${name} must use the PostgreSQL protocol`)
  }

  const identity = decodeURIComponent(`${parsed.username}@${parsed.hostname}`).toLowerCase()
  if (!identity.includes(stagingRef.toLowerCase())) {
    throw new Error(`${name} does not contain STAGING_PROJECT_REF in its database identity`)
  }
  if (identity.includes(productionRef.toLowerCase())) {
    throw new Error(`${name} references the production project; refusing to continue`)
  }
  return parsed
}

const pooled = verifyUrl('STAGING_DATABASE_URL', process.env.STAGING_DATABASE_URL)
const direct = verifyUrl('STAGING_DIRECT_URL', process.env.STAGING_DIRECT_URL)

if (pooled.pathname !== direct.pathname) {
  throw new Error('Staging pooled and direct URLs must select the same database name')
}

console.log(`Staging database identity verified for project ${stagingRef}; production project rejected.`)
