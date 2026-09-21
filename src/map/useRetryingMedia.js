import { useEffect, useRef, useState } from 'react'

// A file's NAME reaches the wall's server (the op) up to a second before its
// BYTES do (a separate transfer landing the asset itself); the wall's
// <video>/<img> requests the URL the moment the op arrives, gets a 404, and
// throws MediaError code 4 or the image equivalent. Nothing retries a failed
// element on its own — reloading the whole page is what made it play, which
// is the bug: a show machine runs unattended for hours and nobody is there to
// reload it.
//
// So a source keeps asking for itself: 2s, 4s, 8s, then every 15s for as long
// as it is mounted with that ref — a file may arrive late, or the server
// hosting it may restart mid-show. The schedule resets whenever `ref` changes
// (a different file entirely, not a retry of this one) and stops the moment
// the element loads.
const RETRY_DELAYS_MS = [2000, 4000, 8000]
const RETRY_CEILING_MS = 15000

const delayForAttempt = (attempt) => RETRY_DELAYS_MS[attempt] ?? RETRY_CEILING_MS

// `attempt` doubles as the element's React `key`: bumping it remounts the
// <img>/<video> so the browser issues a fresh request for the SAME url. A
// query string would do that too, but the asset route is strict about query
// params and the url is the content address — it must stay exactly what the
// manifest recorded.
export function useRetryingMedia(ref) {
    const [attempt, setAttempt] = useState(0)
    const timerRef = useRef(null)

    // Runs on mount, on every `ref` change, and on unmount (React calls the
    // cleanup in all three cases) — one place clears whatever timer is
    // pending and starts the count over for the new ref.
    useEffect(() => {
        setAttempt(0)
        return () => {
            clearTimeout(timerRef.current)
            timerRef.current = null
        }
    }, [ref])

    const onError = () => {
        clearTimeout(timerRef.current)
        timerRef.current = setTimeout(() => setAttempt((current) => current + 1), delayForAttempt(attempt))
    }

    const onLoaded = () => {
        clearTimeout(timerRef.current)
        timerRef.current = null
    }

    return { attempt, onError, onLoaded }
}
