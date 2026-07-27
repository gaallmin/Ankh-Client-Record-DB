import { useEffect, useRef } from 'react'

/**
 * Makes the Android hardware/gesture back button (and iOS edge-swipe, and a
 * regular browser back button) close an open modal instead of navigating
 * away or exiting the app. Push a history entry while the modal is open;
 * popstate closes it. Works in a normal browser tab too, not just Capacitor.
 */
export function useAndroidBackDismiss(open: boolean, onDismiss: () => void) {
  const pushedRef = useRef(false)

  useEffect(() => {
    if (!open) return

    window.history.pushState({ __modalDismiss: true }, '')
    pushedRef.current = true

    const handlePopState = () => {
      pushedRef.current = false
      onDismiss()
    }
    window.addEventListener('popstate', handlePopState)

    return () => {
      window.removeEventListener('popstate', handlePopState)
      // If the modal is being closed by something other than the back
      // button (e.g. clicking the X), consume the history entry we pushed
      // so back doesn't land the user on a phantom "modal open" state.
      if (pushedRef.current) {
        pushedRef.current = false
        window.history.back()
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])
}
