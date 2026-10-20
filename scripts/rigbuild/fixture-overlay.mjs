// fixture-overlay.mjs — lay measured fixture fields over a document's lamps when the server that stores the document is
// older than the fields (a workaround, named: the real home is the document; projectSchema.js keeps panOffsetDeg/panInvert
// since 2026-10-17). File: { "<entity id>": { "panOffsetDeg": 45, "panInvert": true }, … }. Pure but for reading the file.
import fs from 'node:fs'

export const withFixtureOverlay = (entities, file) => {
    if (!file) return entities
    const over = JSON.parse(fs.readFileSync(file, 'utf8'))
    return entities.map((e) => (over[e.id] && e.components?.fixture ? { ...e, components: { ...e.components, fixture: { ...e.components.fixture, ...over[e.id] } } } : e))
}
