// The door between the 3D room and the picture chain (owner, 2026-11-10: "a
// logical gap" between the 3D space and the VJ deck). The engine existed — a
// plane with components.surface = { surfaceId } shows that mapping surface
// live (project/viewport/liveScreen.js) and a `network` surface runs a deck —
// but nothing said "make a screen". These pure helpers build the ops; the
// Studio editor applies them as ONE batch, so one Ctrl+Z takes the whole
// screen (entity + surface) back.
import { createEntityOfType } from '../../project/entityRegistry.js'
import { generateId } from '../../shared/projectSchema.js'

export const SCREEN_NAME = 'Screen'
// 16:9, standing: width x depth of the plane (depth is its height once stood up).
export const SCREEN_WIDTH = 3.2
export const SCREEN_HEIGHT = 1.8

// The picture a screen should run: the first VJ deck, else the first Picture Out.
export const findPictureSource = (document) => {
    const nodes = Array.isArray(document?.nodes) ? document.nodes : []
    return nodes.find((node) => node?.typeId === 'vj.deck') || nodes.find((node) => node?.typeId === 'top.out') || null
}

// An existing surface that already shows pictures: kind network, and its ref is a node that is
// still in the document. A surface left pointing at a deleted deck shows nothing, so it is skipped
// and a new one is made on the live deck instead (review 2026-11-12, N3876 #2).
export const findPictureSurface = (document) => {
    const surfaces = document?.mappingState?.surfaces || []
    const nodeIds = new Set((Array.isArray(document?.nodes) ? document.nodes : []).map((node) => node?.id))
    return surfaces.find((surface) => surface?.source?.kind === 'network' && surface.source.ref && nodeIds.has(surface.source.ref)) || null
}

// What a picture source is called to a person.
export const describeSurfaceSource = (surface, document) => {
    const source = surface?.source || {}
    if (source.kind === 'network') {
        const node = (document?.nodes || []).find((entry) => entry.id === source.ref)
        if (!node) return 'Pictures'
        return node.typeId === 'vj.deck' ? `VJ Deck${node.label ? ` ${node.label}` : ''}` : (node.label || 'Picture Out')
    }
    const labels = { test: 'Test pattern', project: '3D scene', url: 'Web page', video: 'Video', image: 'Image', colour: 'Colour', camera: 'Camera', stream: 'Stream', ndi: 'NDI', card: 'Card' }
    return labels[source.kind] || source.kind || 'Card'
}

// Surface select options for a screen: "Name — what it shows".
export const screenSurfaceOptions = (document) => (document?.mappingState?.surfaces || []).map((surface) => ({
    value: surface.id,
    label: `${surface.name || surface.id} — ${describeSurfaceSource(surface, document)}`
}))

const screenComponents = (position, rotation, scale, surfaceId) => ({
    transform: { position, rotation: rotation || [Math.PI / 2, 0, 0], ...(scale ? { scale } : {}) },
    primitive: { width: SCREEN_WIDTH, depth: SCREEN_HEIGHT },
    ...(surfaceId ? { surface: { surfaceId } } : {})
})

// The ops that bind a screen: reuse a picture surface, else make one, else none.
const bindOps = (document) => {
    const existing = findPictureSurface(document)
    if (existing) return { surfaceId: existing.id, ops: [], created: false }
    const source = findPictureSource(document)
    if (!source) return { surfaceId: null, ops: [], created: false }
    const surfaceId = generateId('srf')
    return {
        surfaceId,
        created: true,
        ops: [{
            type: 'createMappingSurface',
            payload: { surface: { id: surfaceId, name: SCREEN_NAME, source: { kind: 'network', ref: source.id } } }
        }]
    }
}

// "Screen" in the add menu. `position` is where the person is looking; the
// plane stands with its bottom edge on that height.
export const buildScreenOps = (document, { position = [0, 0, 0], createdBy = null } = {}) => {
    const bind = bindOps(document)
    const at = [position[0], position[1] + SCREEN_HEIGHT / 2, position[2]]
    const entity = createEntityOfType('plane', {
        name: SCREEN_NAME,
        createdBy,
        components: screenComponents(at, null, null, bind.surfaceId)
    })
    return {
        entity,
        surfaceId: bind.surfaceId,
        bound: Boolean(bind.surfaceId),
        createdSurface: bind.created,
        ops: [...bind.ops, { type: 'createEntity', payload: { entity } }]
    }
}

// "Show the live deck here instead" on a file-video object: a Screen at the
// same place, the video object removed in the same batch. Undo restores the
// video exactly (its asset ref is in the removed entity, untouched).
export const buildVideoToScreenOps = (document, video, { createdBy = null } = {}) => {
    if (!video || video.type !== 'video') return null
    const bind = bindOps(document)
    const transform = video.components?.transform || {}
    const entity = createEntityOfType('plane', {
        name: video.name ? `${video.name} (screen)` : SCREEN_NAME,
        parentId: video.parentId || null,
        createdBy,
        components: screenComponents(
            transform.position || [0, SCREEN_HEIGHT / 2, 0],
            transform.rotation || null,
            transform.scale || null,
            bind.surfaceId
        )
    })
    return {
        entity,
        surfaceId: bind.surfaceId,
        bound: Boolean(bind.surfaceId),
        ops: [...bind.ops, { type: 'createEntity', payload: { entity } }, { type: 'deleteEntity', payload: { entityId: video.id } }]
    }
}
