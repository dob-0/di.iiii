import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { buildLook, sourceOf } from './buildLook.js'
import { unitsOfDocument, rigPartsOf } from '../studio/utils/sceneEdit.js'
import { normalizeRigLooks } from './projectSchema.js'
import { v1Entities, v1Looks, v1RigParts } from '../../scripts/rigbuild/epic-build.mjs'

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
// A FROZEN copy of rig v2.11 (fixtures, looks, cues) taken 2026-10-15 17:5x: the parity digest must not move when the show's data
// moves (it broke twice that day on recolours); the live rig is covered by the 0-differences test below.
const file = 'src/shared/__fixtures__/rig-parity-2026-10-15.json'
const rig = JSON.parse(fs.readFileSync(path.join(repo, file), 'utf8'))
const ctx = { axis: 0.13, stage: { front: 24.5, into: 1 } }
const ents = v1Entities(rig)
const built = v1Looks(rig, ents, ctx, file)
const rigParts = v1RigParts(rig, ents)

describe('buildLook: the one function the build script and the Studio share', () => {
    it('epic-build still gives, for every look of the v2-11 rig, exactly what it gave before the refactor (0 differences)', () => {
        // sha256 of JSON [{id, aims, colours, levels}] of the 51 looks, taken from the build script BEFORE it called buildLook (2026-10-15)
        const digest = crypto.createHash('sha256').update(JSON.stringify(built.looks.map(({ id, aims, colours, levels }) => ({ id, aims, colours, levels })))).digest('hex')
        expect(built.looks).toHaveLength(51)
        // Pinned against the frozen copy 2026-10-15 17:5x (before: re-pinned at 04:5x after recolour 3); the digest
        // follows the rig file, so it is re-pinned whenever the rig changes on purpose (the old pin was 5300f747…).
        expect(digest).toBe('b8c2bd1a11316d6754d8953327b928c2871834c3e89fba7014cb98cd30ab51eb')
    })

    it('buildLook from a look\'s SOURCE and the document alone equals what the build wrote, for every look (0 differences)', () => {
        const doc = { entities: [{ id: 'rig-show', components: { rigLooks: built, rigParts: { parts: rigParts } } }, ...ents] }
        let diffs = 0
        for (const look of built.looks) {
            const units = unitsOfDocument(doc.entities, look)
            const got = buildLook(sourceOf(look), rigPartsOf(doc), units)
            if (JSON.stringify(got.colours) !== JSON.stringify(look.colours) || JSON.stringify(got.levels) !== JSON.stringify(look.levels) || JSON.stringify(got.aims) !== JSON.stringify(look.aims)) diffs += 1
        }
        expect(diffs).toBe(0)
    })

    it('a look keeps its source through the schema: parts, laser_colour, desk_caps, act', () => {
        const rl = normalizeRigLooks(built)
        const out = new Map(rl.looks.map((l) => [l.id, l]))
        for (const l of built.looks) {
            const n = out.get(l.id)
            expect(n.parts).toEqual(l.parts)
            if (l.laser_colour) expect(n.laser_colour).toBe(l.laser_colour)
            if (l.desk_caps) expect(n.desk_caps).toEqual(l.desk_caps)
        }
        expect(rl.looks.some((l) => l.desk_caps)).toBe(true)
    })

    it('a unit no part lists is its own part; a part left out is off; a laser takes laser_colour', () => {
        const units = [{ id: 'a', key: 'ka', colour: '#112233' }, { id: 'rig-laser-1a', key: 'kl', colour: '#00ff00' }]
        const r = buildLook({ parts: { a: ['#FF0000', 0.5], laser: ['#ffffff', 0.16] }, laser_colour: '#00FF00' }, { laser: ['rig-laser-1a'] }, units)
        expect(r.colours).toEqual({ ka: '#ff0000', kl: '#00ff00' })
        expect(r.levels).toEqual({ ka: 0.5, kl: 0.16 })
        expect(buildLook({ parts: {} }, {}, units).levels).toEqual({ ka: 0, kl: 0 })
    })
})
