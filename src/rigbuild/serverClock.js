// THE SERVER'S TIME, AS SEEN FROM THIS TAB — so every viewer of a show counts from the
// same clock (showClock.js, RIG_BUILD.md §16).
//
// A viewer's own clock can be off by seconds (a phone that never synced, a laptop
// with the wrong zone set by hand), and the show's cue is computed from the time. So
// the tab measures its offset from the server once, by Cristian's method (F. Cristian,
// "Probabilistic clock synchronization", Distributed Computing 3(3), 1989): note the
// local time before (t0) and after (t1) one request, read the server's time T from the
// answer, and take
//
//     offset = T + (t1 − t0) / 2 − t1        error ≤ (t1 − t0) / 2
//
// It asks a few times and keeps the sample with the shortest round trip (the tightest
// bound), which is what NTP's clock filter does with its eight. The answer is
// `/serverXR/api/health`'s `timestamp` (Date.now() on the server). If the server does
// not answer, the offset is 0 and the local clock is used — the show still plays, only
// without the correction; nothing is thrown or logged.

export const SAMPLES = 4

/** One sample from a round trip, or null when the answer carries no time. */
export const sampleOf = ({ t0, t1, serverMs }) => {
    if (!Number.isFinite(t0) || !Number.isFinite(t1) || !Number.isFinite(serverMs) || t1 < t0) return null
    const rtt = t1 - t0
    return { offset: serverMs + rtt / 2 - t1, error: rtt / 2 }
}

/** The best of several samples: the one with the smallest error bound. */
export const bestSample = (samples) => (samples || [])
    .filter(Boolean)
    .reduce((best, s) => (!best || s.error < best.error ? s : best), null)

const healthUrl = () => (typeof window !== 'undefined' && window.location ? `${window.location.origin}/serverXR/api/health` : null)

export const measureServerOffset = async ({ fetchImpl, now = () => Date.now(), url = healthUrl(), samples = SAMPLES } = {}) => {
    const call = fetchImpl || (typeof fetch === 'function' ? (...a) => fetch(...a) : null)
    if (!call || !url) return { offset: 0, error: null, measured: false }
    const got = []
    for (let i = 0; i < samples; i += 1) {
        try {
            const t0 = now()
            const res = await call(url, { cache: 'no-store', credentials: 'omit' })
            const t1 = now()
            if (!res?.ok) continue
            const body = await res.json()
            got.push(sampleOf({ t0, t1, serverMs: Number(body?.timestamp) }))
        } catch { /* a missing answer is a missing sample */ }
    }
    const best = bestSample(got)
    return best ? { offset: best.offset, error: best.error, measured: true } : { offset: 0, error: null, measured: false }
}

let shared = null
/** The page's one measurement, taken once and shared by every room on the page. */
export const getServerOffset = () => {
    if (!shared) shared = measureServerOffset()
    return shared
}

// for tests
export const resetServerOffset = () => { shared = null }
