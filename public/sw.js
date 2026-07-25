const CACHE_NAME = 'visiflow-shell-__VISIFLOW_BUILD_ID__'
const APP_SHELL = ['./', './index.html', './manifest.webmanifest', './icons/visiflow.svg']

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then(async (cache) => {
    await Promise.all(APP_SHELL.map(async (url) => {
      const response = await fetch(url, { cache: 'reload' })
      await cache.put(url, response)
    }))
  }))
})

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys
    .filter((key) => key.startsWith('visiflow-shell-') && key !== CACHE_NAME)
    .map((key) => caches.delete(key)))).then(() => self.clients.claim()))
})

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting()
})

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return
  if (event.request.mode === 'navigate') {
    event.respondWith(fetch(event.request).then((response) => {
      const copy = response.clone()
      void caches.open(CACHE_NAME).then((cache) => cache.put('./index.html', copy))
      return response
    }).catch(() => caches.match('./index.html')))
    return
  }
  event.respondWith(caches.match(event.request).then((cached) => cached ?? fetch(event.request).then((response) => {
    if (new URL(event.request.url).origin !== self.location.origin) return response
    const copy = response.clone()
    void caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy))
    return response
  })))
})
