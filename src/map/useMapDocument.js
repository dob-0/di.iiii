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
        addSurface: (patch = {}) => {
            const id = generateId('srf')
            applyOps({ type: 'createMappingSurface', payload: { surface: { id, name: patch.name || '', ...patch } } })
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
        setOutput: (patch) => applyOps({ type: 'setMappingState', payload: { patch } })
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
