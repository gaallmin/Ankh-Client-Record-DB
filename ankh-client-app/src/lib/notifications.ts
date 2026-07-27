import * as http2 from 'node:http2'
import jwt from 'jsonwebtoken'
import { prisma } from '@/lib/prisma'
import type { NotificationType } from '@prisma/client'

type DevicePlatform = 'android' | 'ios' | 'web'
type PushDevice = { id: string; token: string; platform: string }
type SendResult = { providerId?: string }

let fcmTokenCache: { token: string; expiresAt: number } | null = null
let apnsTokenCache: { token: string; expiresAt: number } | null = null

export function notificationMode(): 'mock' | 'live' {
  const mode = process.env.NOTIFICATIONS_MODE || 'mock'
  if (mode !== 'mock' && mode !== 'live') throw new Error('NOTIFICATIONS_MODE must be mock or live')
  if (process.env.NODE_ENV === 'production' && mode !== 'live') {
    throw new Error('Production push delivery requires NOTIFICATIONS_MODE=live')
  }
  return mode
}

function parseFcmServiceAccount() {
  const raw = process.env.FCM_SERVICE_ACCOUNT_JSON
  if (!raw) throw new Error('FCM_SERVICE_ACCOUNT_JSON is required for Android push')
  const parsed = JSON.parse(raw) as { client_email?: string; private_key?: string; project_id?: string }
  if (!parsed.client_email || !parsed.private_key || !parsed.project_id) {
    throw new Error('FCM_SERVICE_ACCOUNT_JSON is missing client_email, private_key, or project_id')
  }
  return { ...parsed, private_key: parsed.private_key.replace(/\\n/g, '\n') } as {
    client_email: string; private_key: string; project_id: string
  }
}

export function validatePushConfiguration(platform: DevicePlatform): void {
  if (platform === 'android') {
    parseFcmServiceAccount()
    return
  }
  if (platform === 'ios') {
    const required = ['APNS_TEAM_ID', 'APNS_KEY_ID', 'APNS_BUNDLE_ID_CLIENT', 'APNS_PRIVATE_KEY'] as const
    const missing = required.filter(name => !process.env[name])
    if (missing.length) throw new Error(`Missing iOS push configuration: ${missing.join(', ')}`)
    return
  }
  throw new Error(`Unsupported push platform: ${platform}`)
}

async function getFcmAccessToken(): Promise<{ accessToken: string; projectId: string }> {
  const serviceAccount = parseFcmServiceAccount()
  if (fcmTokenCache && fcmTokenCache.expiresAt > Date.now() + 60_000) {
    return { accessToken: fcmTokenCache.token, projectId: serviceAccount.project_id }
  }
  const assertion = jwt.sign(
    { scope: 'https://www.googleapis.com/auth/firebase.messaging' },
    serviceAccount.private_key,
    {
      algorithm: 'RS256',
      issuer: serviceAccount.client_email,
      audience: 'https://oauth2.googleapis.com/token',
      expiresIn: '1h',
    }
  )
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  })
  if (!tokenRes.ok) throw new Error(`FCM token exchange failed: ${tokenRes.status}`)
  const data = await tokenRes.json() as { access_token?: string; expires_in?: number }
  if (!data.access_token) throw new Error('FCM token exchange returned no access token')
  fcmTokenCache = { token: data.access_token, expiresAt: Date.now() + (data.expires_in || 3600) * 1000 }
  return { accessToken: data.access_token, projectId: serviceAccount.project_id }
}

export async function sendFcmPush(to: string, title: string, body: string): Promise<SendResult> {
  const { accessToken, projectId } = await getFcmAccessToken()
  const response = await fetch(`https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: { token: to, notification: { title, body } } }),
  })
  if (!response.ok) throw new Error(`FCM send failed: ${response.status} ${await response.text()}`)
  const data = await response.json() as { name?: string }
  return { providerId: data.name }
}

function getApnsJwt(): { token: string; bundleId: string; host: string } {
  validatePushConfiguration('ios')
  const teamId = process.env.APNS_TEAM_ID
  const keyId = process.env.APNS_KEY_ID
  const bundleId = process.env.APNS_BUNDLE_ID_CLIENT
  const privateKey = process.env.APNS_PRIVATE_KEY?.replace(/\\n/g, '\n')
  if (!teamId || !keyId || !bundleId || !privateKey) {
    throw new Error('APNS_TEAM_ID, APNS_KEY_ID, APNS_BUNDLE_ID_CLIENT, and APNS_PRIVATE_KEY are required for iOS push')
  }
  if (!apnsTokenCache || apnsTokenCache.expiresAt <= Date.now() + 60_000) {
    const token = jwt.sign({}, privateKey, {
      algorithm: 'ES256',
      issuer: teamId,
      header: { alg: 'ES256', kid: keyId, typ: 'JWT' },
      expiresIn: '50m',
    })
    apnsTokenCache = { token, expiresAt: Date.now() + 50 * 60 * 1000 }
  }
  const host = process.env.APNS_ENVIRONMENT === 'sandbox'
    ? 'https://api.sandbox.push.apple.com'
    : 'https://api.push.apple.com'
  return { token: apnsTokenCache.token, bundleId, host }
}

export async function sendApnsPush(to: string, title: string, body: string): Promise<SendResult> {
  const { token, bundleId, host } = getApnsJwt()
  return new Promise((resolve, reject) => {
    const client = http2.connect(host)
    let settled = false
    const finish = (error?: Error, result?: SendResult) => {
      if (settled) return
      settled = true
      client.close()
      if (error) reject(error)
      else resolve(result || {})
    }
    client.once('error', error => finish(error))
    const request = client.request({
      ':method': 'POST',
      ':path': `/3/device/${encodeURIComponent(to)}`,
      authorization: `bearer ${token}`,
      'apns-topic': bundleId,
      'apns-push-type': 'alert',
      'apns-priority': '10',
      'content-type': 'application/json',
    })
    let status = 0
    let responseBody = ''
    let apnsId: string | undefined
    request.on('response', headers => {
      status = Number(headers[':status'] || 0)
      apnsId = typeof headers['apns-id'] === 'string' ? headers['apns-id'] : undefined
    })
    request.setEncoding('utf8')
    request.on('data', chunk => { responseBody += chunk })
    request.on('error', error => finish(error))
    request.on('end', () => {
      if (status < 200 || status >= 300) finish(new Error(`APNs send failed: ${status} ${responseBody}`))
      else finish(undefined, { providerId: apnsId })
    })
    request.end(JSON.stringify({ aps: { alert: { title, body }, sound: 'default' } }))
  })
}

async function sendPush(device: PushDevice, title: string, body: string): Promise<SendResult> {
  if (notificationMode() === 'mock') {
    console.log(`[notifications:mock] PUSH/${device.platform} -> ${device.token.slice(0, 6)}… "${title}"`)
    return { providerId: `mock-${Date.now()}` }
  }
  validatePushConfiguration(device.platform as DevicePlatform)
  if (device.platform === 'android') return sendFcmPush(device.token, title, body)
  if (device.platform === 'ios') return sendApnsPush(device.token, title, body)
  throw new Error(`Unsupported push platform: ${device.platform}`)
}

export interface NotifyEventInput {
  type: NotificationType
  dedupeKey: string
  customerId: string
  reservationId?: string
  title: string
  body: string
}

export async function notifyCustomer(input: NotifyEventInput): Promise<void> {
  try {
    const account = await prisma.clientAccount.findUnique({
      where: { customerId: input.customerId },
      include: { devices: { where: { revokedAt: null } } },
    })
    if (!account || !account.notifyByPush || account.devices.length === 0) {
      await prisma.notification.create({
        data: {
          type: input.type,
          channel: 'PUSH',
          dedupeKey: `${input.dedupeKey}:PUSH:NONE`,
          title: input.title,
          body: input.body,
          customerId: input.customerId,
          clientAccountId: account?.id || null,
          reservationId: input.reservationId || null,
          status: 'SKIPPED',
          error: !account ? 'no client account' : !account.notifyByPush ? 'push opted out' : 'no active device',
        },
      }).catch(error => {
        if (!(typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002')) throw error
      })
      return
    }

    for (const device of account.devices) {
      try {
        const notification = await prisma.notification.create({
          data: {
            type: input.type,
            channel: 'PUSH',
            dedupeKey: `${input.dedupeKey}:PUSH:${device.id}`,
            title: input.title,
            body: input.body,
            customerId: input.customerId,
            clientAccountId: account.id,
            clientDeviceId: device.id,
            reservationId: input.reservationId || null,
            status: 'PENDING',
          },
        })
        await attemptPushSend(notification.id, device, input.title, input.body)
      } catch (error) {
        if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002') continue
        throw error
      }
    }
  } catch (error) {
    console.error('notifyCustomer failed (reservation action unaffected):', error)
  }
}

export async function attemptPushSend(
  notificationId: string,
  device: PushDevice,
  title: string,
  body: string
): Promise<boolean> {
  try {
    const result = await sendPush(device, title, body)
    await prisma.notification.update({
      where: { id: notificationId },
      data: { status: 'SENT', sentAt: new Date(), providerId: result.providerId || null, attempts: { increment: 1 }, error: null },
    })
    return true
  } catch (error) {
    await prisma.notification.update({
      where: { id: notificationId },
      data: { status: 'FAILED', error: String(error).slice(0, 500), attempts: { increment: 1 } },
    }).catch(() => {})
    return false
  }
}

export function reservationEventKey(type: NotificationType, reservationId: string, statusTo?: string): string {
  return statusTo ? `${type}:${reservationId}:${statusTo}` : `${type}:${reservationId}`
}
