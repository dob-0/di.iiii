// Vite fires `vite:preloadError` on window when a lazily imported chunk (or its
// CSS) fails to load — https://vite.dev/guide/build#load-error-handling. After
// a deploy the hashed chunks of the old build are gone, so the fix is one
// reload to pick up the new shell. The flag keeps a genuinely broken deploy
// from reload-looping: a second failure inside the window is left to throw.
// Complements lazyWithReload (per-surface); this covers every plain lazy().
export const PRELOAD_RELOAD_FLAG = 'chunk-reload:vite-preload'
export const PRELOAD_RELOAD_WINDOW_MS = 60_000

export function installPreloadRecovery({ win = window, now = Date.now } = {}) {
    const handler = (event) => {
        let last = 0
        try { last = Number(win.sessionStorage.getItem(PRELOAD_RELOAD_FLAG)) || 0 } catch { return }
        const t = now()
        if (last && t - last < PRELOAD_RELOAD_WINDOW_MS) return
        try { win.sessionStorage.setItem(PRELOAD_RELOAD_FLAG, String(t)) } catch { return }
        event?.preventDefault?.()
        win.location.reload()
    }
    win.addEventListener('vite:preloadError', handler)
    return () => win.removeEventListener('vite:preloadError', handler)
}
