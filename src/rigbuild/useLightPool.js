import { useEffect, useMemo, useState } from 'react'
import { applyLightPool, lightPoolOptions, lightPoolWanted, poolSettled, stepLightPool } from './lightPool.js'

// THE LIGHT POOL IN THE ROOM (lightPool.js). OFF unless the document's
// `mappingState.lightPool.enabled` or the page's `?lightPool=1` asks: then the entities
// the room draws are re-made with N fixed slot lights carrying the light of the lamps
// that matter most in the look that plays. Off, the entities pass through untouched
// (the same array). The pool's state is React state stepped in an effect (a pure step
// per change of the entities), and a ~30 Hz clock beats only while a hand-over is under
// way, never otherwise.

const TICK_MS = 33
const pageSearch = () => (typeof window !== 'undefined' && window.location ? window.location.search : '')
const wallClock = () => Date.now()

export function useLightPool(entities, document, { search, now = wallClock } = {}) {
    const mapping = document?.mappingState
    const on = useMemo(() => lightPoolWanted({ mappingState: mapping, search: search ?? pageSearch() }), [mapping, search])
    const opts = useMemo(() => lightPoolOptions(mapping), [mapping])
    const [state, setState] = useState(null)
    // The hand-over clock: the time of its last beat, 0 before any. It moves only on its
    // own tick, so a render never makes a new drawing by itself (cf. useRigLook's fade clock).
    const [clock, setClock] = useState(0)
    useEffect(() => {
        if (!on || !entities) { setState((s) => (s === null ? s : null)); return }
        setState((s) => stepLightPool(s, entities, now(), opts))
    }, [on, entities, opts, now, clock])
    const pooled = useMemo(
        () => (!on || !entities || !state ? entities : applyLightPool(entities, state, clock > 0 ? clock : now(), opts)),
        [on, entities, state, opts, now, clock]
    )
    useEffect(() => {
        if (!on || !state || poolSettled(state, now(), opts.handoverMs)) return undefined
        const timer = setInterval(() => {
            setClock(now())
            if (poolSettled(state, now(), opts.handoverMs)) clearInterval(timer)
        }, TICK_MS)
        return () => clearInterval(timer)
    }, [on, state, opts, now])
    return pooled
}

export default useLightPool
