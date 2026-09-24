import { useEffect, useMemo } from 'react'
import { useProjectStore } from '../project/state/projectStore.js'
import { useProjectDocumentSync } from '../project/hooks/useProjectDocumentSync.js'
import { defaultMappingSurface, generateId } from '../shared/projectSchema.js'
import { fireCue as fireCueShared } from './cueFiring.js'
import { mapChannelName, useMapOpCourier } from './mapCourier.js'

// Both map routes talk to one project document through the ordinary op layer,
// so a mapping is a normal di.iiii document with normal history — not a file
// beside the platform, the way a Resolume composition is a file beside the
// work it shows.
//
// On top of that sits a BroadcastChannel, kept in src/map/mapCourier.js — the
// 3D scene writes to a mapping too now (it fires cues), and the courier had to
// stop being private to this hook.
export { mapChannelName }

export function useMapDocument(projectId, { role = 'desk' } = {}) {
    const store = useProjectStore()
    const { state } = store
    const { applyLocalOps, syncState } = useProjectDocumentSync({
        projectId,
        store,
        clientIdPrefix: `map-${role}-client`,
        opIdPrefix: `map-${role}-op`
    })

    const document = state.document
    const mapping = document?.mappingState

    const applyOps = useMapOpCourier(projectId, applyLocalOps)

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
        // The source is written out rather than left to the normalizer's
        // empty `ref`, so what a new surface shows is a fact in the document
        // every machine reads the same way — the dim identification card, not
        // the bright alignment grid. Duplicate passes a whole surface and so
        // overrides it with the original's own source, which is correct.
        addSurface: (patch = {}) => {
            const id = generateId('srf')
            applyOps({
                type: 'createMappingSurface',
                payload: { surface: { name: '', source: { ...defaultMappingSurface.source }, ...patch, id } }
            })
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

        // A video/image surface can point at a file brought in from this
        // machine. The bytes are uploaded straight to the project (same route
        // Studio and the node editor use); this only records the manifest
        // entry, through the same op layer every other change travels
        // through, so it reaches every other desk and the output window too.
        upsertAsset: (asset) => {
            if (!asset?.id) return
            applyOps({ type: 'upsertAsset', payload: { asset } })
        },

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

        // Firing a cue is ONE op batch, and the batch is built in
        // src/map/cueFiring.js — the same call the 3D scene's cue strip makes.
        // Nothing downstream of that function can tell which tool pressed the
        // key, which is the whole point of letting two tools press it.
        fireCue: (cue) => fireCueShared(cue, applyOps)
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
