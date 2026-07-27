'use client'

// Push registration for the CLIENT app only (mounted by /[locale]/client).
// No-op on the web and in the staff app. On the native client shell:
// requests permission properly (iOS prompt / Android 13+ runtime permission),
// registers the FCM/APNs token with the backend per account+device, and
// re-registers on token refresh. Authentication uses the HttpOnly client
// session cookie, so no token is exposed to browser JavaScript.

import { useEffect } from 'react'

export default function ClientPushBridge() {
  useEffect(() => {
    let cancelled = false

    ;(async () => {
      const { Capacitor } = await import('@capacitor/core')
      if (!Capacitor.isNativePlatform() || cancelled) return

      const { PushNotifications } = await import('@capacitor/push-notifications')

      const registerToken = async (token: string) => {
        await fetch('/api/client/devices', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token, platform: Capacitor.getPlatform() })
        }).catch(() => {})
      }

      let perm = await PushNotifications.checkPermissions()
      if (perm.receive === 'prompt') {
        perm = await PushNotifications.requestPermissions()
      }
      if (perm.receive !== 'granted') return

      await PushNotifications.addListener('registration', t => { registerToken(t.value) })
      await PushNotifications.addListener('registrationError', err => {
        console.error('Push registration error:', err)
      })
      await PushNotifications.register()
    })()

    return () => { cancelled = true }
  }, [])

  return null
}
