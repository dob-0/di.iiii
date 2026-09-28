// @vitest-environment node
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { TYPE_LIBRARY } from './types/index.js'
import { hasRigLamps, rigBodyLamps } from './rigBodyLamps.js'
import { bodyKindOf, bodyPoses } from './FixtureBodies.jsx'
import { deletions } from '../../scripts/rigbuild/load-plot.mjs'

// The lamps' bodies in every room (RIG_BUILD.md §12.4; owner 2026-09-28 on /moxir:
// "i can't see the models of the lights now"). known-fixes: "bodies drawn in view A only".

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8')

const lamp = (id, over = {}) => ({
    id,
    type: 'spotLight',
    components: {
        transform: { position: [0, 6, 10], rotation: [0, 0, 0], scale: [1, 1, 1] },
        light: { color: '#ff2020' },
        fixture: { type: 'up-b380f' },
        ...over
    }
})

describe('rigBodyLamps — which lamps a room draws a body for', () => {
    it('every typed lamp, with its mount, beam and light colour', () => {
        const out = rigBodyLamps([lamp('a'), { id: 'box', type: 'box', components: {} }], TYPE_LIBRARY)
        expect(out.map((l) => l.id)).toEqual(['a'])
        expect(out[0].colour).toBe('#ff2020')
        expect(out[0].type).toBe('up-b380f')
        expect(out[0].mount).toHaveLength(3)
        expect(out[0].beam).toHaveLength(3)
    })

    it('a hung lamp hangs: its mount is above its lens', () => {
        const [l] = rigBodyLamps([lamp('h', { fixture: { type: 'up-250bsw', hung: true }, transform: { position: [0, 6, 10], rotation: [Math.PI, 0, 0], scale: [1, 1, 1] } })], TYPE_LIBRARY)
        expect(l.hung).toBe(true)
        expect(l.mount[1]).toBeGreaterThan(6)
    })

    it('not a hidden lamp, not one nested in a group, not an untyped light', () => {
        const hidden = lamp('x', { runtime: { visible: false } })
        const nested = { ...lamp('n'), parentId: 'g' }
        const untyped = { id: 'u', type: 'spotLight', components: { light: {} } }
        expect(rigBodyLamps([hidden, nested, untyped], TYPE_LIBRARY)).toEqual([])
        expect(hasRigLamps([untyped])).toBe(false)
        expect(hasRigLamps([untyped, lamp('a')])).toBe(true)
    })

    it('every MOXIR type with a model gets posed parts', () => {
        const kinds = bodyPoses(rigBodyLamps([lamp('a'), lamp('b', { fixture: { type: 'up-pl5403' } })], TYPE_LIBRARY), TYPE_LIBRARY)
        expect([...kinds.keys()].sort()).toEqual(['beam380', 'par'])
        for (const poses of kinds.values()) expect(Object.keys(poses[0].parts).length).toBeGreaterThan(0)
    })
})

describe('every type in the library has a body', () => {
    it('each type\'s model3d names a kind FixtureBodies draws', () => {
        const missing = TYPE_LIBRARY.types.filter((t) => !bodyKindOf(t)).map((t) => t.id)
        expect(missing).toEqual([])
    })
})

describe('the rooms draw them', () => {
    it('the space view (LiveProjectScene) and the Studio viewport (Studio, plot and cards rooms) mount RigBodies', () => {
        expect(read('src/components/LiveProjectScene.jsx')).toMatch(/<RigBodies entities=\{entities\} \/>/)
        expect(read('src/studio/components/StudioViewport.jsx')).toMatch(/<RigBodies entities=\{sceneEntities\} \/>/)
    })

    it('view A draws its own and turns the room\'s off (no double bodies)', () => {
        expect(read('src/rigbuild/BuildSurface.jsx')).toMatch(/rigBodies=\{false\}/)
        expect(read('src/rigbuild/BuildScene.jsx')).toMatch(/<FixtureBodies /)
    })
})

describe('load-plot keeps the baked column wash (owed on #607)', () => {
    const have = new Map([
        ['rig-wash', { id: 'rig-wash', type: 'model' }],
        ['rig-beams', { id: 'rig-beams', type: 'model' }],
        ['rig-fixtures', { id: 'rig-fixtures', type: 'model' }],
        ['rig-old-lamp-01', { id: 'rig-old-lamp-01', type: 'spotLight' }],
        ['place-hall', { id: 'place-hall', type: 'model' }]
    ])
    const base = { have, incomingIds: new Set(), pieceIds: new Set(), replaced: new Set() }

    it('a full load: beams and bodies go, the wash stays', () => {
        const out = deletions({ ...base, piecesOnly: false })
        expect(out).toContain('rig-beams')
        expect(out).toContain('rig-fixtures')
        expect(out).toContain('rig-old-lamp-01')
        expect(out).not.toContain('rig-wash')
        expect(out).not.toContain('place-hall')
    })

    it('--pieces-only: no lamps left, so the wash goes too', () => {
        expect(deletions({ ...base, piecesOnly: true })).toContain('rig-wash')
    })
})
