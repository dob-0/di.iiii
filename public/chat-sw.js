/* The studio chat's service worker.
 *
 * It lives at the ROOT so it can claim the scope `/chat` — a worker served from
 * `/chat/sw.js` may only claim `/chat/`, and `/chat` is not inside `/chat/`.
 * It is registered by the chat surface alone (src/chat/StudioChatSurface.jsx),
 * never site-wide: this file must not end up in front of the editor, the
 * viewer, or a published page. A stale app shell served to a person authoring
 * a scene is a far worse bug than a chat that needs the network.
 *
 * Network first, always. The cache holds the shell and this build's assets, and
 * that is the whole of it: opened with no signal the app loads and says
 * "Backend unavailable — Retry" in its own type, instead of handing the person
 * the browser's dinosaur. It does NOT show the conversation. Chat lines are
 * never cached — they live in the socket and in the server's transcript, and a
 * cached copy of a conversation is a copy that can be wrong about who said what.
 */

const CACHE = 'dii-chat-shell-v1'
const SHELL = '/chat'

self.addEventListener('install', (event) => {
    event.waitUntil((async () => {
        const cache = await caches.open(CACHE)
        // Failing to warm the cache must not fail the install — an install
        // behind a captive portal would then leave no worker at all.
        await cache.add(new Request(SHELL, { cache: 'reload' })).catch(() => {})
        // `cache.add` keeps whatever it got, redirect included; drop it rather
        // than serve something a navigation cannot use.
        const warmed = await cache.match(SHELL)
        if (warmed?.redirected) await cache.delete(SHELL)
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

// The page tells the worker what it actually loaded. Without this the cache
// holds the HTML and nothing else: by the time the worker is installed the
// browser has already fetched this build's JS and CSS, so they never pass
// through a fetch handler, and an offline reload renders a blank white page —
// the shell with no app in it. The URLs are content-hashed, so this is the one
// list that is true for this build and stays true.
self.addEventListener('message', (event) => {
    const data = event.data
    if (!data || data.type !== 'dii-chat-warm' || !Array.isArray(data.urls)) return
    event.waitUntil((async () => {
        const cache = await caches.open(CACHE)
        await Promise.all(data.urls.map((url) => cache.add(new Request(url, { credentials: 'same-origin' })).catch(() => {})))
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
                // A redirected response may not be used to satisfy a
                // navigation, so caching one guarantees the offline path
                // fails with ERR_FAILED rather than showing the room. This is
                // belt and braces — the reason /chat redirected at all (a
                // directory of the same name in public/) is gone.
                if (!fresh.redirected) {
                    const cache = await caches.open(CACHE)
                    cache.put(SHELL, fresh.clone())
                }
                return fresh
            } catch {
                const cached = await caches.match(SHELL, { ignoreVary: true })
                return cached || Response.error()
            }
        })())
        return
    }

    // Build output is content-hashed, so a hit is the same bytes forever.
    if (url.pathname.startsWith('/assets/') || url.pathname.startsWith('/fonts/') || url.pathname.startsWith('/chat-app/')) {
        event.respondWith((async () => {
            // ignoreVary: the server sends `Vary: Accept-Encoding` (compression),
            // and the header on a replay does not always match the header on the
            // request that filled the cache. Without this a cache full of the
            // right files still misses every one of them.
            const cached = await caches.match(request, { ignoreVary: true })
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
