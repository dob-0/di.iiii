// The address a guest was working at, after they sign in.
//
// Signing in carries the guest sandbox onto the account (promoteGuestSandbox
// in serverXR): same scene, same projects, same files — under the account's
// own sandbox id. The page the person signed in FROM still names the old id,
// so the first thing they saw after signing in was "Nothing lives at
// sandbox-guest…", about the work they had just been told came with them.
//
// The browser remembers the one guest sandbox it has held. When a signed-in
// account then asks for exactly that id and the server says it is gone, the
// same path under the account's own sandbox is where the work now lives.
// Nothing here opens a door: the account's sandbox is already its own, and
// the gate still checks it like any other address.
const STORAGE_KEY = 'dii.guestSandboxSpaceId'

const normalizeId = (value) => String(value || '').trim().toLowerCase()

const storage = () => {
    try { return typeof window !== 'undefined' ? window.localStorage : null } catch { return null }
}

export const rememberGuestSandbox = (session) => {
    if (!session?.authenticated || session.type !== 'guest' || !session.sandboxSpaceId) return
    try { storage()?.setItem(STORAGE_KEY, normalizeId(session.sandboxSpaceId)) } catch { /* private mode — the redirect is a convenience */ }
}

const readRememberedGuestSandbox = () => {
    try { return normalizeId(storage()?.getItem(STORAGE_KEY)) } catch { return '' }
}

// The path to go to instead, or null. `location` is { pathname, search, hash }.
export const carriedSandboxPath = (session, missingSpaceId, location) => {
    const missing = normalizeId(missingSpaceId)
    const target = normalizeId(session?.sandboxSpaceId)
    if (!missing || !target || missing === target) return null
    if (!session?.authenticated || session.type === 'guest') return null
    if (readRememberedGuestSandbox() !== missing) return null
    const segments = String(location?.pathname || '').split('/')
    const at = segments.findIndex((segment) => normalizeId(segment) === missing)
    if (at === -1) return null
    segments[at] = target
    return `${segments.join('/')}${location?.search || ''}${location?.hash || ''}`
}
