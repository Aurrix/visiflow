import { useCallback, useEffect, useState } from 'react'

export function PwaUpdatePrompt() {
  const [registration, setRegistration] = useState<ServiceWorkerRegistration | null>(null)
  const [updateAvailable, setUpdateAvailable] = useState(false)

  useEffect(() => {
    // A cache-first service worker must never control Vite's development
    // modules: it can serve an outdated transform and prevents HMR from
    // connecting. Remove any worker registered by an earlier dev session.
    if (import.meta.env.DEV) {
      void navigator.serviceWorker?.getRegistrations().then((registrations) => {
        registrations.forEach((item) => { void item.unregister() })
      })
      void window.caches?.keys().then((keys) => {
        keys
          .filter((key) => key.startsWith('visiflow-shell-'))
          .forEach((key) => { void window.caches.delete(key) })
      })
      return
    }

    if (!window.isSecureContext || !('serviceWorker' in navigator)) return

    let active = true
    let reloading = false
    const showUpdate = () => {
      if (navigator.serviceWorker.controller) setUpdateAvailable(true)
    }
    const onControllerChange = () => {
      if (reloading) return
      reloading = true
      window.location.reload()
    }
    const checkForUpdate = () => { void registration?.update() }
    let registration: ServiceWorkerRegistration | null = null

    void navigator.serviceWorker.register(new URL('./sw.js', window.location.href), { scope: './', updateViaCache: 'none' }).then((next) => {
      if (!active) return
      registration = next
      setRegistration(next)
      if (next.waiting) showUpdate()
      next.addEventListener('updatefound', () => {
        const worker = next.installing
        if (!worker) return
        worker.addEventListener('statechange', () => {
          if (worker.state === 'installed') showUpdate()
        })
      })
    }).catch(() => undefined)

    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange)
    window.addEventListener('focus', checkForUpdate)
    document.addEventListener('visibilitychange', checkForUpdate)
    const interval = window.setInterval(checkForUpdate, 60 * 60 * 1000)
    return () => {
      active = false
      navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange)
      window.removeEventListener('focus', checkForUpdate)
      document.removeEventListener('visibilitychange', checkForUpdate)
      window.clearInterval(interval)
    }
  }, [])

  const applyUpdate = useCallback(() => {
    registration?.waiting?.postMessage({ type: 'SKIP_WAITING' })
  }, [registration])

  if (!updateAvailable) return null
  return <aside className="pwa-update" role="status" aria-live="polite">
    <span>A new version is ready.</span>
    <button type="button" className="primary-button" onClick={applyUpdate}>Update</button>
  </aside>
}
