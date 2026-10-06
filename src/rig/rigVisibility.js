// Can the other di.iiii on this network see this one — the desk's half.
//
// The server works the answer out (serverXR/src/rig/visibility.js, served at
// GET /api/rig/visibility behind the local-runtime guard). This file asks for
// it and turns it into the few plain rows the desk shows. Found 2026-09-24:
// three copies on one network, one invisible by design, and nothing on any
// screen said so or said what to type.
//
// The three answers a page can get:
//   200  the server's own answer — this page is on the machine it serves
//   403  the guard refused this page's machine — only a PRIVATE copy does that,
//        so the refusal is itself the answer: the copy serving this page is
//        private
//   404 / no answer   a hosted tier, DI_RIG=0, or an older server — say nothing
import { useEffect, useState } from 'react'
import { apiFetch } from '../services/apiClient.js'

const POLL_MS = 10_000

export async function readRigVisibility({ fetchImpl = apiFetch } = {}) {
    try {
        const answer = await fetchImpl('/api/rig/visibility')
        return answer && typeof answer.visible === 'boolean' ? { state: 'answer', visibility: answer } : { state: 'none' }
    } catch (error) {
        if (error?.status === 403) return { state: 'refused' }
        return { state: 'none' }
    }
}

const who = (entry) => `${entry.address || 'an unknown address'}${entry.name ? ` (${entry.name})` : ''}`

/**
 * The rows the desk shows, in reading order. Empty when there is nothing a
 * person needs to know — an open copy with nobody private nearby says nothing.
 * @returns {Array<{ key: string, text: string }>}
 */
export function describeRigRows(result) {
    if (!result) return []
    if (result.state === 'refused') {
        return [{ key: 'private', text: 'the di.iiii serving this page is private — other di.iiii on the network can\'t see it · di up --lan on that machine' }]
    }
    if (result.state !== 'answer') return []
    const v = result.visibility
    const nearby = Array.isArray(v.nearby) ? v.nearby : []
    if (!v.visible) {
        const open = nearby.filter((entry) => entry && entry.open === true)
        return [
            { key: 'private', text: 'this machine is private — other di.iiii on the network can\'t see it · di up --lan' },
            ...(open.length
                ? [{ key: 'heard', text: `${open.length} other di.iiii on this network: ${open.map(who).join(', ')}` }]
                : [])
        ]
    }
    return nearby
        .filter((entry) => entry && entry.open === false)
        .map((entry) => ({ key: `nearby:${entry.id}`, text: `a di.iiii at ${who(entry)} is on this network but private` }))
}

export function useRigVisibility({ read = readRigVisibility, pollMs = POLL_MS } = {}) {
    const [result, setResult] = useState(null)
    useEffect(() => {
        let cancelled = false
        const tick = () => read().then((next) => { if (!cancelled) setResult(next) })
        tick()
        const timer = setInterval(tick, pollMs)
        return () => { cancelled = true; clearInterval(timer) }
    }, [read, pollMs])
    return result
}
