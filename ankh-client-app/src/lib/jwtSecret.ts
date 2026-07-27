const INSECURE_SECRETS = new Set([
  'your_fallback_secret_for_dev_only',
  'your_jwt_secret_here',
  'change-me',
])

/**
 * Return the JWT signing secret or fail closed.
 *
 * Kept as a function so builds can compile without evaluating request-time
 * secrets, while every sign/verify operation still refuses unsafe config.
 */
export function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET?.trim()
  if (!secret || secret.length < 32 || INSECURE_SECRETS.has(secret)) {
    throw new Error('JWT_SECRET must be configured with at least 32 non-placeholder characters')
  }
  return secret
}
