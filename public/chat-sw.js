/* The studio chat's service worker.
 *
 * It lives at the ROOT so it can claim the scope `/chat` — a worker served from
 * `/chat/sw.js` may only claim `/chat/`, and `/chat` is not inside `/chat/`.
 * It is registered by the chat surface alone (src/chat/StudioChatSurface.jsx),
 * never site-wide: this file must not end up in front of the editor, the
 * viewer, or a published page. A stale app shell served to a person authoring
 * a scene is a far worse bug than a chat that needs the network.
 *
 * Network first, always. The cache exists for one thing — an installed app
 * opened with no signal shows the room and says it is offline, instead of the
 * browser's dinosaur. Chat lines are NOT cached: they live in the socket and in
 * the server's transcript, and a cached copy of a conversation is a copy that
 * can be wrong.
 */

const CACHE = 'dii-chat-shell-v1'
const SHELL = '/chat'

self.addEventListener('install', (event) => {
    event.waitUntil((async () => {
        const cache = await caches.open(CACHE)
        // Failing to warm the cache must not fail the install — an install
        // behind a captive portal would then leave no worker at all.
        await cache.add(new Request(SHELL, { cache: 'reload' })).catch(() => {})
        await self.skipWaiting()
    })())
})

self.addEventListener('activate', (event) => {
    event.waitUntil((async () => {
        const names = await caches.keys()
        await Promise.all(names.filter((name) => name.startsWith('dii-chat-shell-') && name !== CACHE)
            .map((name) => caches.delete(name)))
        await self.clients.claim()
    })())
})

self.addEventListener('fetch', (event) => {
    const request = event.request
    if (request.method !== 'GET') return
    const url = new URL(request.url)
    if (url.origin !== self.location.origin) return
    // The socket, the session and every API call go straight to the network.
    if (url.pathname.startsWith('/serverXR')) return

    if (request.mode === 'navigate') {
        event.respondWith((async () => {
            try {
                const fresh = await fetch(request)
                const cache = await caches.open(CACHE)
                cache.put(SHELL, fresh.clone())
                return fresh
            } catch {
                const cached = await caches.match(SHELL)
                return cached || Response.error()
            }
        })())
        return
    }

    // Build output is content-hashed, so a hit is the same bytes forever.
    if (url.pathname.startsWith('/assets/') || url.pathname.startsWith('/fonts/') || url.pathname.startsWith('/chat/')) {
        event.respondWith((async () => {
            const cached = await caches.match(request)
            if (cached) return cached
            const fresh = await fetch(request)
            if (fresh.ok) {
                const cache = await caches.open(CACHE)
                cache.put(request, fresh.clone())
            }
            return fresh
        })())
    }
})
