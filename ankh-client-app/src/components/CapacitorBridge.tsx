'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

// No-op on the regular web deployment — only does anything inside the
// Capacitor native shell. Keeps splash screen, status bar, and Android
// hardware back-button behavior consistent with the app UI.
export default function CapacitorBridge() {
  const router = useRouter()

  useEffect(() => {
    let cancelled = false

    ;(async () => {
      const { Capacitor } = await import('@capacitor/core')
      if (!Capacitor.isNativePlatform() || cancelled) return

      const [{ StatusBar, Style }, { SplashScreen }, { App }] = await Promise.all([
        import('@capacitor/status-bar'),
        import('@capacitor/splash-screen'),
        import('@capacitor/app'),
      ])
      if (cancelled) return

      StatusBar.setStyle({ style: Style.Light }).catch(() => {})
      StatusBar.setBackgroundColor({ color: '#ffffff' }).catch(() => {})
      SplashScreen.hide().catch(() => {})

      // Component is mounted once at the root for the app's lifetime, so the
      // listener is intentionally never removed.
      App.addListener('backButton', () => {
        // A modal/sheet pushes a history entry when it opens (see
        // useAndroidBackDismiss); if one is open, popstate closes it and we
        // don't touch navigation here. Otherwise fall back to router.back(),
        // or exit the app if there's nowhere left to go.
        if (window.history.state?.__modalDismiss) {
          window.history.back()
          return
        }
        if (window.history.length > 1) {
          router.back()
        } else {
          App.exitApp()
        }
      })
    })()

    return () => { cancelled = true }
  }, [router])

  return null
}
