// Walking through a portal should land you WALKING. The jump is an SPA route
// change, the viewer remounts, and navMode's useState('orbit') quietly put
// every arrival back in view mode — so a visitor strolling a hub of doors was
// dropped out of their stroll at every threshold. The walker can't carry the
// mode across the remount itself; this one-shot flag does. sessionStorage so
// a shared link never inherits it and a tab close forgets it.
const ARRIVE_WALKING_KEY = 'dii:arrive-walking'

export const markArriveWalking = () => {
    try { window.sessionStorage.setItem(ARRIVE_WALKING_KEY, '1') } catch { /* storage blocked: arrive in view mode */ }
}

// Reads AND clears: the flag must never outlive the one navigation it was set
// for, even when the destination turns out not to be walkable.
export const consumeArriveWalking = () => {
    try {
        const wants = window.sessionStorage.getItem(ARRIVE_WALKING_KEY) === '1'
        window.sessionStorage.removeItem(ARRIVE_WALKING_KEY)
        return wants
    } catch {
        return false
    }
}
