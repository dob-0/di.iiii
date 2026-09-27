import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { lightingApiUrl } from '../../map/lightingLink.js'
import { getSharedLightingMirror } from '../../rigMirror/useLightingMirror.js'
import { addressMap, autoPatch, lampSignature, rigKeyOf, typedMoves } from '../../rigbuild/autoPatch.js'
import { TYPE_LIBRARY } from '../../rigbuild/types/index.js'

// AUTO-PATCH in the Studio (docs/architecture/RIG_BUILD.md §4): whenever the room's
// lamps change — placed, duplicated, pasted, deleted, a mode or an address changed —
// the desk on this machine is asked to agree, and what it decides comes back into the
// document as ops. Only lamps with a fixture TYPE take part, so a room without them
// never reaches the desk at all; and where there is no desk (every hosted di.iiii)
// nothing happens and the lamps simply stay unpatched.
//
// The write-back goes through the SYNC op path, not the undo history: it is the desk's
// answer, not a person's edit, and undoing it would only make the room claim an
// address the desk does not hold.

export const AUTO_PATCH_DEBOUNCE_MS = 400

const post = (route, body) => fetch(lightingApiUrl(route), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body)
})

export function useRigAutoPatch({ projectId, entities = [], applyOps, library = TYPE_LIBRARY, mirror, debounceMs = AUTO_PATCH_DEBOUNCE_MS, postImpl = post } = {}) {
    const [state, setState] = useState({ flags: [], message: '', at: 0 })
    const signature = useMemo(() => lampSignature(entities), [entities])
    const latest = useRef({ entities, applyOps })
    useEffect(() => { latest.current = { entities, applyOps } }, [entities, applyOps])
    // The addresses the room and the desk last agreed on; a difference from these that
    // the room made is a typed move (sent with `move`), anything else is left flagged.
    const known = useRef(null)
    const busy = useRef(Promise.resolve())

    const run = useCallback((options = {}) => {
        const job = busy.current.then(async () => {
            const store = mirror || getSharedLightingMirror()
            if (!(await store.probe())) return { ok: false, message: 'no desk on this machine' }
            const { entities: now, applyOps: apply } = latest.current
            const moved = known.current ? typedMoves(now, known.current) : new Set()
            const out = await autoPatch({ projectId, entities: now, library, post: postImpl, applyOps: apply, moved, ...options })
            if (out.ok && out.result) {
                const agreed = addressMap(now)
                for (const a of out.result.assignments || []) {
                    if (a.how === 'differs') continue
                    const id = a.key.slice(projectId.length + 1)
                    agreed.set(id, `${a.universe}.${a.address}`)
                }
                known.current = agreed
                setState({ flags: out.result.flags || [], message: out.message, at: Date.now() })
            }
            return out
        })
        busy.current = job.catch(() => {})
        return job
    }, [projectId, library, mirror, postImpl])

    useEffect(() => {
        if (!projectId) return undefined
        // No lamp has ever been here: never touch the desk.
        if (!signature && known.current == null) return undefined
        const timer = setTimeout(() => { run() }, debounceMs)
        return () => clearTimeout(timer)
    }, [signature, projectId, debounceMs, run])

    // "Patch this group": the given lamps laid out again as one contiguous block.
    const patchGroup = useCallback((entityIds) => run({
        group: true,
        repatch: true,
        prune: false,
        only: new Set(entityIds)
    }), [run])

    return { ...state, patchGroup, rigKeyOf: (id) => rigKeyOf(projectId, id) }
}

export default useRigAutoPatch
