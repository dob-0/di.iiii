// Starting an OAuth sign-in from INSIDE a frame fails at the provider: GitHub and
// Google refuse to render in any frame, so navigating the frame lands on their
// "can't open this page" wall (seen from the desk's nodes panel, 2026-09-02).
// Framed, the sign-in goes to a new tab and the frame follows once the session
// exists; top-level, it navigates as before.

export const isFramed = () => {
    try { return window.self !== window.top } catch { return true }
}

// Returns true when the sign-in was sent to a new tab (the caller may then poll
// its session); false when this window navigated itself.
export const startOAuth = (url, {
    framed = isFramed(),
    open = (u) => window.open(u, '_blank'),
    go = (u) => { window.location.href = u },
} = {}) => {
    if (!framed) { go(url); return false }
    const tab = open(url)
    if (!tab) { go(url); return false }   // popup blocked: better a provider wall than nothing
    return true
}
