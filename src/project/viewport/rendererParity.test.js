import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { ENTITY_TYPES } from '../../shared/projectSchema.js'

// LiveProjectScene deliberately keeps its own entity renderer (billboard text,
// gate glow, walker collisions). That duplication shipped real drift twice:
// new appearance/media props reached the editor but not published scenes, and
// audio/light/group entities were silently dropped from the public viewer.
// This tripwire compares the two renderers at the source level so any feature
// added to EntityContent fails here until the viewer mirrors it.

const read = (rel) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8')
const entityContentSrc = read('./EntityContent.jsx')
const liveSceneSrc = read('../../components/LiveProjectScene.jsx')
    .split('function AnimatedEntity')[0]

const caseLabels = (src) => new Set([...src.matchAll(/case '([\w-]+)'/g)].map((m) => m[1]))
const componentKeys = (src, component) => new Set(
    [...src.matchAll(new RegExp(`\\b${component}\\.([A-Za-z]+)`, 'g'))].map((m) => m[1])
)

describe('editor viewport ↔ public viewer renderer parity', () => {
    it('the public viewer renders every entity type EntityContent renders', () => {
        const editor = caseLabels(entityContentSrc)
        const viewer = caseLabels(liveSceneSrc)
        const missing = [...editor].filter((t) => !viewer.has(t))
        expect(missing).toEqual([])
    })

    it('every schema entity type has a renderer case in both surfaces', () => {
        const editor = caseLabels(entityContentSrc)
        const viewer = caseLabels(liveSceneSrc)
        const gaps = ENTITY_TYPES.filter((t) => !editor.has(t) || !viewer.has(t))
        expect(gaps).toEqual([])
    })

    it('the public viewer consumes every appearance/media key the editor consumes', () => {
        for (const component of ['appearance', 'media']) {
            const editorKeys = componentKeys(entityContentSrc, component)
            const viewerKeys = componentKeys(liveSceneSrc, component)
            const missing = [...editorKeys].filter((k) => !viewerKeys.has(k))
            expect(missing, `${component} keys missing from LiveProjectScene`).toEqual([])
        }
    })
})
