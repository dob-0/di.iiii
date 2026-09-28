// Ask for pointer lock with raw mouse input, fall back to a plain lock.
//
// W3C Pointer Lock 2.0 (https://w3c.github.io/pointerlock/): requestPointerLock
// takes `{ unadjustedMovement: true }` to bypass the OS pointer acceleration,
// returns a Promise, and rejects with NotSupportedError when the platform
// cannot give raw input. Measured 2026-09-28 on the owner's browser build —
// Chromium 153.0.8010.52 (flatpak), X11: it rejects with
// "NotSupportedError: The options asked for in this request are not supported
// on this platform.", and a plain request made straight after, still inside
// the same click's activation, is granted. Chromium grants raw input on
// Windows and ChromeOS.
//
// Only NotSupportedError triggers the plain retry. Any other rejection (the
// lock denied outright: Wayland, iframe policy, the cool-down after an Esc
// release) is left to the caller's drag-look fallback, exactly as before.
//
// Once a platform has said NotSupported it will say it again, so later
// requests skip straight to the plain lock — on this page, and (remembered
// per browser build in localStorage) on the next visit, so the first click
// does not pay a rejected round trip every time.

const RAW_UNSUPPORTED_KEY = 'di.iiii.look.rawUnsupportedUA'

function currentUa() {
    try { return typeof navigator !== 'undefined' ? String(navigator.userAgent || '') : '' } catch { return '' }
}

function readRemembered() {
    try { return window.localStorage.getItem(RAW_UNSUPPORTED_KEY) === currentUa() } catch { return false }
}

function remember() {
    try { window.localStorage.setItem(RAW_UNSUPPORTED_KEY, currentUa()) } catch { /* not remembered: fine */ }
}

let rawUnsupported = null

// A browser that ignores the options dictionary still resolves, and would
// then be counted as raw when it is not. Only Chromium implements
// unadjustedMovement (MDN compatibility data, 2026), and only Chromium exposes
// navigator.userAgentData — so a resolved raw request is trusted only there.
function trustsRawOption() {
    try {
        return typeof navigator !== 'undefined' && !!navigator.userAgentData
    } catch {
        return false
    }
}

// Resolves { locked, raw, reason }. Never rejects.
export async function requestRawPointerLock(el) {
    if (rawUnsupported === null) rawUnsupported = readRemembered()
    const wantRaw = !rawUnsupported && trustsRawOption()
    if (wantRaw) {
        try {
            const req = el.requestPointerLock({ unadjustedMovement: true })
            if (req && typeof req.then === 'function') {
                await req
                return { locked: true, raw: true, reason: 'raw granted' }
            }
            // Pre-2.0 Chromium returned undefined and ignored the option.
            return { locked: true, raw: false, reason: 'no promise: option ignored' }
        } catch (err) {
            if (err?.name !== 'NotSupportedError') {
                return { locked: false, raw: false, reason: err?.name || 'denied' }
            }
            rawUnsupported = true
            remember()
        }
    }
    try {
        const req = el.requestPointerLock()
        if (req && typeof req.then === 'function') await req
        return { locked: true, raw: false, reason: rawUnsupported ? 'raw not supported' : 'raw not requested' }
    } catch (err) {
        return { locked: false, raw: false, reason: err?.name || 'denied' }
    }
}

export function __resetRawPointerLockForTests() {
    rawUnsupported = null
    try { window.localStorage.removeItem(RAW_UNSUPPORTED_KEY) } catch { /* none */ }
}
