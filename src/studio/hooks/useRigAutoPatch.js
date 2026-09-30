import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { lightingApiUrl } from '../../map/lightingLink.js'
import { getSharedLightingMirror } from '../../rigMirror/useLightingMirror.js'
import { addressMap, autoPatch, lampSignature, rigKeyOf, typedMoves } from '../../rigbuild/autoPatch.js'
import { TYPE_LIBRARY } from '../../rigbuild/types/index.js'
import { libraryWithShow } from '../../rigbuild/rental.js'

// AUTO-PATCH in the Studio (docs/architecture/RIG_BUILD.md §4): when the person on THIS
// page changes the room's lamps — places, duplicates, pastes, deletes, changes a mode,
// types an address, or undoes one of those — the desk on this machine is asked to agree,
// and what it decides comes back into the document as ops. Only lamps with a fixture
// TYPE take part, so a room without them never reaches the desk at all; and where there
// is no desk (every hosted di.iiii) nothing happens and the lamps simply stay unpatched.
//
// A READER NEVER WRITES (2026-10-01, MOXIR): opening a page, refreshing it, or a change
// that arrived from someone else patches nothing — neither the desk (`prune` takes the
// project's other fixtures off it) nor the document. Only `edits` moving (this page's
// own op history, useOpHistory) arms a patch; `patchNow()` and `patchGroup()` are the
// explicit ones.
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

export function useRigAutoPatch({ projectId, entities = [], applyOps, edits = 0, library = TYPE_LIBRARY, mirror, debounceMs = AUTO_PATCH_DEBOUNCE_MS, postImpl = post } = {}) {
    const [state, setState] = useState({ flags: [], message: '', at: 0 })
    const signature = useMemo(() => lampSignature(entities), [entities])
    const latest = useRef({ entities, applyOps })
    useEffect(() => { latest.current = { entities, applyOps } }, [entities, applyOps])
    // The addresses the room and the desk last agreed on; a difference from these that
    // the room made is a typed move (sent with `move`), anything else is left flagged.
    // Until this page has patched, the room as it arrived is taken as agreed.
    const known = useRef(null)
    const busy = useRef(Promise.resolve())
    // The lamps as they last arrived from anywhere but this person's edits (the loaded
    // document, a collaborator, the desk's answer written back), and whether an edit of
    // this person's is waiting to be patched.
    const settled = useRef(null)
    const seenEdits = useRef(edits)
    const armed = useRef(false)

    const run = useCallback((options = {}) => {
        const job = busy.current.then(async () => {
            const store = mirror || getSharedLightingMirror()
            if (!(await store.probe())) return { ok: false, message: 'no desk on this machine' }
            const { entities: now, applyOps: apply } = latest.current
            const moved = known.current ? typedMoves(now, known.current) : new Set()
            // The show's own types (RIG_BUILD.md §13) patch like the library's.
            const out = await autoPatch({ projectId, entities: now, library: libraryWithShow(library, now), post: postImpl, applyOps: apply, moved, ...options })
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
        if (edits !== seenEdits.current) {
            seenEdits.current = edits
            armed.current = true
        }
        if (!armed.current) {
            // Opened, refreshed, or changed by someone else: read, never written.
            settled.current = signature
            const room = addressMap(entities)
            if (!known.current) known.current = room
            else for (const [id, at] of room) if (!known.current.has(id)) known.current.set(id, at)
            return undefined
        }
        const timer = setTimeout(() => {
            armed.current = false
            // This person's edit did not touch a lamp: nothing to ask the desk.
            if (lampSignature(latest.current.entities) === settled.current) return
            run()
        }, debounceMs)
        return () => clearTimeout(timer)
    }, [signature, edits, entities, projectId, debounceMs, run])

    // "Patch the room": every lamp, asked for by a person (the desk keeps what it holds).
    const patchNow = useCallback(() => run(), [run])

    // "Patch this group": the given lamps laid out again as one contiguous block.
    const patchGroup = useCallback((entityIds) => run({
        group: true,
        repatch: true,
        prune: false,
        only: new Set(entityIds)
    }), [run])

    return { ...state, patchNow, patchGroup, rigKeyOf: (id) => rigKeyOf(projectId, id) }
}

export default useRigAutoPatch
