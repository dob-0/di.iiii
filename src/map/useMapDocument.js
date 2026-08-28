import { useCallback, useEffect, useMemo, useRef } from 'react'
import { useProjectStore } from '../project/state/projectStore.js'
import { useProjectDocumentSync } from '../project/hooks/useProjectDocumentSync.js'
import { generateId } from '../shared/projectSchema.js'

// Both map routes talk to one project document through the ordinary op layer,
// so a mapping is a normal di.iiii document with normal history — not a file
// beside the platform, the way a Resolume composition is a file beside the
// work it shows.
//
// On top of that sits a BroadcastChannel. The op layer already syncs the
// output window, but it round-trips through the server and coalesces at 50ms,
// and dragging a corner while watching the wall is the one interaction where
// that delay is the whole experience. Same-origin windows on one machine get
// the edit immediately; the op layer still carries it to disk, and to any
// window that is not on this machine. The channel is a courier, never the
// record — an output window that never hears it is late, not wrong.
export const mapChannelName = (projectId) => `di-map-${projectId}`

export function useMapDocument(projectId, { role = 'desk' } = {}) {
    const store = useProjectStore()
    const { state } = store
    const { applyLocalOps, syncState } = useProjectDocumentSync({
        projectId,
        store,
        clientIdPrefix: `map-${role}-client`,
        opIdPrefix: `map-${role}-op`
    })

    const channelRef = useRef(null)
    useEffect(() => {
        if (!projectId || typeof BroadcastChannel === 'undefined') return undefined
        const channel = new BroadcastChannel(mapChannelName(projectId))
        channelRef.current = channel
        return () => {
            channelRef.current = null
            channel.close()
        }
    }, [projectId])

    const document = state.document
    const mapping = document?.mappingState

    const applyOps = useCallback((ops) => {
        const list = Array.isArray(ops) ? ops : [ops]
        if (!list.length) return
        applyLocalOps(list)
        channelRef.current?.postMessage({ kind: 'ops', ops: list })
    }, [applyLocalOps])

    const surfaces = useMemo(() => mapping?.surfaces || [], [mapping])
    const surfaceById = useMemo(
        () => new Map(surfaces.map((surface) => [surface.id, surface])),
        [surfaces]
    )

    const api = useMemo(() => ({
        // The generated id goes LAST and always wins. Spreading the caller's
        // patch over it meant a duplicate — which passes the whole surface it
        // is copying, `id` included — kept the ORIGINAL id, so
        // createMappingSurface saw an id that already existed and dropped the
        // op on the floor. The button did nothing at all, silently.
        addSurface: (patch = {}) => {
            const id = generateId('srf')
            applyOps({ type: 'createMappingSurface', payload: { surface: { name: '', ...patch, id } } })
            return id
        },
        updateSurface: (surfaceId, patch) => {
            if (!surfaceId || !patch) return
            applyOps({ type: 'setMappingSurface', payload: { surfaceId, patch } })
        },
        deleteSurface: (surfaceId) => {
            if (!surfaceId) return
            applyOps({ type: 'deleteMappingSurface', payload: { surfaceId } })
        },
        reorderSurfaces: (surfaceIds) => applyOps({ type: 'reorderMappingSurfaces', payload: { surfaceIds } }),
        setOutput: (patch) => applyOps({ type: 'setMappingState', payload: { patch } }),

        addCue: (patch = {}) => {
            const id = generateId('cue')
            applyOps({ type: 'createMappingCue', payload: { cue: { ...patch, id } } })
            return id
        },
        updateCue: (cueId, patch) => {
            if (!cueId || !patch) return
            applyOps({ type: 'setMappingCue', payload: { cueId, patch } })
        },
        deleteCue: (cueId) => {
            if (!cueId) return
            applyOps({ type: 'deleteMappingCue', payload: { cueId } })
        },
        reorderCues: (cueIds) => applyOps({ type: 'reorderMappingCues', payload: { cueIds } }),

        // Firing a cue is ONE op batch, deliberately: the fade and every
        // surface it touches land in the same document version, so the wall
        // never shows a half-applied cue and the browser reads the new fade
        // duration off the same style change that moves the opacity.
        fireCue: (cue) => {
            if (!cue) return
            const ops = [{ type: 'setMappingState', payload: { patch: { fade: cue.fade } } }]
            Object.entries(cue.surfaces).forEach(([surfaceId, patch]) => {
                if (patch && Object.keys(patch).length) {
                    ops.push({ type: 'setMappingSurface', payload: { surfaceId, patch } })
                }
            })
            applyOps(ops)
        }
    }), [applyOps])

    return { store, document, mapping, surfaces, surfaceById, syncState, applyOps, ...api }
}

// The output window's side of the courier: apply an edit the moment it is
// heard rather than waiting for the server to hand the same op back.
export function useMapChannelListener(projectId, store) {
    useEffect(() => {
        if (!projectId || !store?.dispatch || typeof BroadcastChannel === 'undefined') return undefined
        const channel = new BroadcastChannel(mapChannelName(projectId))
        channel.onmessage = (event) => {
            const ops = event?.data?.kind === 'ops' ? event.data.ops : null
            if (Array.isArray(ops) && ops.length) store.dispatch({ type: 'apply-ops', ops })
        }
        return () => channel.close()
    }, [projectId, store])
}
