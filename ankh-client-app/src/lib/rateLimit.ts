// Simple sliding-window rate limiter for public endpoints (register/login/book).
//
// Limitation (documented): this is per-serverless-instance memory. On Vercel a
// determined attacker spread across instances gets a higher effective budget.
// It still stops naive brute force and accidental loops. For hard guarantees,
// swap the store for Upstash Redis (already a project dependency via QStash's
// vendor) — the interface below stays the same.

const buckets = new Map<string, number[]>()

export function rateLimit(key: string, maxRequests: number, windowMs: number): boolean {
  const now = Date.now()
  const hits = (buckets.get(key) || []).filter(t => now - t < windowMs)
  if (hits.length >= maxRequests) {
    buckets.set(key, hits)
    return false
  }
  hits.push(now)
  buckets.set(key, hits)
  return true
}

export function clientIp(request: Request): string {
  const fwd = request.headers.get('x-forwarded-for')
  return (fwd ? fwd.split(',')[0].trim() : null) || 'unknown'
}
