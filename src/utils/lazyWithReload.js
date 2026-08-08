import { lazy } from 'react'

// A deploy replaces the hashed chunk files. A tab that kept its old shell then
// fails every lazy import and sits on the Suspense fallback forever — seen as
// an endless loading screen on a published space after a staging deploy. One
// forced reload fetches the new shell; the per-key flag keeps a genuinely
// broken deploy from reload-looping, and is cleared on success so the next
// deploy in the same tab gets its own retry.
export default function lazyWithReload(importer, key) {
    const flag = `chunk-reload:${key}`
    return lazy(() => importer().then((module) => {
        try { window.sessionStorage.removeItem(flag) } catch { /* opaque origin */ }
        return module
    }).catch((error) => {
        let seen = true
        try {
            seen = Boolean(window.sessionStorage.getItem(flag))
            if (!seen) window.sessionStorage.setItem(flag, '1')
        } catch { /* opaque origin — no storage, do not loop */ }
        if (!seen) {
            window.location.reload()
            return new Promise(() => {})
        }
        throw error
    }))
}
