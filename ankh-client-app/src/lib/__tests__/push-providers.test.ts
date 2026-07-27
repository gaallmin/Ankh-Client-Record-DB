import { generateKeyPairSync } from 'node:crypto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { notificationMode, sendFcmPush, validatePushConfiguration } from '../notifications'

const ENV_KEYS = [
  'NOTIFICATIONS_MODE', 'FCM_SERVICE_ACCOUNT_JSON',
  'APNS_TEAM_ID', 'APNS_KEY_ID', 'APNS_BUNDLE_ID_CLIENT', 'APNS_PRIVATE_KEY',
] as const
const originalEnv = Object.fromEntries(ENV_KEYS.map(key => [key, process.env[key]]))

afterEach(() => {
  for (const key of ENV_KEYS) {
    const value = originalEnv[key]
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

describe('production push configuration', () => {
  it('fails closed instead of silently using mock delivery in production', () => {
    vi.stubEnv('NODE_ENV', 'production')
    process.env.NOTIFICATIONS_MODE = 'mock'
    expect(() => notificationMode()).toThrow(/requires NOTIFICATIONS_MODE=live/)
  })

  it('requires all APNs credentials for iOS', () => {
    delete process.env.APNS_TEAM_ID
    expect(() => validatePushConfiguration('ios')).toThrow(/APNS_TEAM_ID/)
  })

  it('builds authenticated FCM HTTP v1 requests for Android', async () => {
    const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
    process.env.FCM_SERVICE_ACCOUNT_JSON = JSON.stringify({
      client_email: 'firebase@example.invalid',
      private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
      project_id: 'ankh-test-project',
    })
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: 'access-token', expires_in: 3600 }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ name: 'projects/ankh-test-project/messages/1' }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    const result = await sendFcmPush('device-token', 'Confirmed', 'Your reservation is confirmed')
    expect(result.providerId).toContain('/messages/1')
    expect(fetchMock).toHaveBeenCalledTimes(2)
    const sendCall = fetchMock.mock.calls[1]
    expect(String(sendCall[0])).toContain('/v1/projects/ankh-test-project/messages:send')
    expect(sendCall[1]?.headers).toMatchObject({ Authorization: 'Bearer access-token' })
    expect(JSON.parse(String(sendCall[1]?.body))).toMatchObject({
      message: { token: 'device-token', notification: { title: 'Confirmed' } },
    })
  })
})
