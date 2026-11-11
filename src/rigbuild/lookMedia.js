// THE WALL FOLLOWS THE LOOK (owner N3855, 2026-11-12: "scenes work but visuals not connected").
//
// A picture entity may carry `components.lookMedia = { byLook: { <lookId>: <assetId> } }`: which of the project's own
// assets it shows in which look. The room draws the entity with that asset while the look is on; a look the map does
// not name leaves the wall DARK (opacity 0, the cabinet behind it shows) — a wrong picture would be a lie, a dark wall
// is what a screen with no content is. With no look on at all the entity is drawn as stored.
// Pure: entities in, entities out; the same array when nothing carries a map. Written by scripts/rigbuild/screen-picture.mjs.

export const lookMediaOf = (entity) => {
    const m = entity?.components?.lookMedia
    return m && typeof m === 'object' && m.byLook && typeof m.byLook === 'object' ? m.byLook : null
}

export const withLookMedia = (entities, lookId) => {
    if (!lookId || !Array.isArray(entities)) return entities
    let changed = false
    const out = entities.map((e) => {
        const byLook = lookMediaOf(e)
        if (!byLook) return e
        const assetId = typeof byLook[lookId] === 'string' ? byLook[lookId] : ''
        if (assetId && assetId === e.components.media?.assetId) return e
        changed = true
        if (assetId) return { ...e, components: { ...e.components, media: { ...e.components.media, assetId } } }
        return { ...e, components: { ...e.components, appearance: { ...e.components.appearance, opacity: 0 } } }
    })
    return changed ? out : entities
}
