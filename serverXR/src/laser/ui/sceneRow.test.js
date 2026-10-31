// The laser desk's Scenes row, the rules (ui/sceneRow.js): which buttons, what is marked, what one press sends and what it says.
// The real page with a fake server behind fetch is in deskScenes.test.js.
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const here = path.dirname(fileURLToPath(import.meta.url))
const row = require('./sceneRow.js')

const SCENES = [{ id: 'muth01', name: 'MUTH 01 Threshold' }, { id: 'muth05', name: 'MUTH 05 Catacomb' }, { id: 'muth00', name: 'MUTH 00 Hush' }, { id: 'spare', name: 'Spare' }]
const TABLE = { muth01: { look: 'muth-01-threshold', name: 'MUTH 01 Threshold' }, muth05: { look: 'muth-05-catacomb', name: 'MUTH 05 Catacomb' }, muth00: { look: 'muth-00-hush', name: 'MUTH 00 Hush' } }

describe('the buttons', () => {
    it('one per light scene, in the light desk\'s order (muth00 last), each with the look that follows it or none', () => {
        const items = row.sceneItems({ scenes: SCENES, table: TABLE })
        expect(items.map((i) => i.id)).toEqual(['muth01', 'muth05', 'muth00', 'spare'])
        expect(items.map((i) => i.look && i.look.id)).toEqual(['muth-01-threshold', 'muth-05-catacomb', 'muth-00-hush', null])
        expect(items.map(row.lookLine)).toEqual(['laser: MUTH 01 Threshold', 'laser: MUTH 05 Catacomb', 'laser: MUTH 00 Hush', 'lights only'])
    })
    it('marks the scene the light desk has on and the look that is on the cubes', () => {
        const items = row.sceneItems({ scenes: SCENES, table: TABLE, activeScene: 'muth05', liveId: 'muth-00-hush' })
        expect(items.map((i) => [i.id, i.lights, i.laser])).toEqual([['muth01', false, false], ['muth05', true, false], ['muth00', false, true], ['spare', false, false]])
        const none = row.sceneItems({ scenes: SCENES, table: TABLE })
        expect(none.every((i) => !i.lights && !i.laser)).toBe(true)
    })
    it('a scene with no look is never "live"; inherited keys are not links; a row with no id is dropped', () => {
        const items = row.sceneItems({ scenes: [{ id: 'constructor' }, { id: '__proto__', name: 'P' }, { name: 'no id' }, null, { id: 'x', name: '  ' }], table: {}, liveId: null })
        expect(items.map((i) => [i.id, i.name, i.look])).toEqual([['constructor', 'constructor', null], ['__proto__', 'P', null], ['x', 'x', null]])
        expect(row.sceneItems({ scenes: 'nope', table: null })).toEqual([])
    })
    it('the tooltip says what a press does, lights only included', () => {
        const [a, , , spare] = row.sceneItems({ scenes: SCENES, table: TABLE })
        expect(row.titleOf(a)).toContain('puts MUTH 01 Threshold on the cubes')
        expect(row.titleOf(spare)).toContain('No laser look follows this scene')
    })
})

// A recording pair of routes, in the order they were called.
const routes = (opts = {}) => {
    const light = 'light' in opts ? opts.light : { ok: true } // an explicit undefined stays undefined
    const laser = 'laser' in opts ? opts.laser : { ok: true }
    const calls = []
    return {
        calls,
        lightPost: async (p, body) => { calls.push(['light', p, body]); if (light instanceof Error) throw light; return light },
        goLook: async (id) => { calls.push(['laser', id]); if (laser instanceof Error) throw laser; return laser }
    }
}
const press = (r, id, extra = {}) => {
    const scene = SCENES.find((s) => s.id === id)
    const l = TABLE[id]
    return row.pressScene({ scene, link: l ? { look: l.look, name: l.name } : null, lightPost: r.lightPost, goLook: r.goLook, ...extra })
}

describe('one press', () => {
    it('recalls the scene on the light desk AND makes its look live, each once, lights first', async () => {
        const r = routes()
        const out = await press(r, 'muth05')
        expect(r.calls).toEqual([['light', 'scenes/recall', { id: 'muth05' }], ['laser', 'muth-05-catacomb']])
        expect(out.kind).toBe('ok')
        expect(out.text).toBe('MUTH 05 Catacomb: lights recalled. Laser look MUTH 05 Catacomb is live.')
    })
    it('a scene with no look is lights only: the laser is not asked', async () => {
        const r = routes()
        const out = await press(r, 'spare')
        expect(r.calls).toEqual([['light', 'scenes/recall', { id: 'spare' }]])
        expect(out).toMatchObject({ kind: 'ok', laser: null })
        expect(out.text).toBe('Spare: lights recalled. No laser look follows it.')
    })
    it('a refused light route is said in plain words, once, and the look still goes (no retry)', async () => {
        const r = routes({ light: { ok: false, status: 403 } })
        const out = await press(r, 'muth01')
        expect(r.calls.filter((c) => c[0] === 'light')).toHaveLength(1)
        expect(r.calls.filter((c) => c[0] === 'laser')).toEqual([['laser', 'muth-01-threshold']])
        expect(out.kind).toBe('error')
        expect(out.text).toBe('Lights did not change: the light desk refused it (403). Laser look MUTH 01 Threshold is live.')
    })
    it('a light desk that is not running (the request dies) is said so', async () => {
        for (const light of [{ ok: false, down: true }, new Error('boom'), undefined, null]) {
            const r = routes({ light })
            const out = await press(r, 'muth05')
            expect(out.kind).toBe('error')
            expect(out.text.startsWith('Lights did not change: the light desk did not answer.')).toBe(true)
            expect(r.calls.filter((c) => c[0] === 'light')).toHaveLength(1)
        }
        expect((await press(routes({ light: { ok: false, down: true, timeout: true } }), 'muth05')).text).toContain('did not answer in time')
    })
    it('the light desk\'s own words, and a scene it no longer has', async () => {
        expect((await press(routes({ light: { ok: false, error: 'owner must be 1-40 letters' } }), 'spare')).text).toBe('Lights did not change: the light desk said "owner must be 1-40 letters".')
        expect((await press(routes({ light: { ok: false, gone: true } }), 'spare')).text).toBe('Lights did not change: that scene is not on the light desk any more.')
    })
    it('a refused or failed laser Go is said, the lights stay recalled', async () => {
        for (const laser of [{ ok: false, error: 'no look "x"' }, new Error('down')]) {
            const out = await press(routes({ laser }), 'muth05')
            expect(out.kind).toBe('error')
            expect(out.text.startsWith('MUTH 05 Catacomb: lights recalled. Laser did not change: this desk said')).toBe(true)
        }
    })
    it('says when a Blackout keeps the light or the cubes dark; it never lifts one', async () => {
        const r = routes()
        const out = await press(r, 'muth05', { blackout: { laser: true, light: true } })
        expect(out.text).toContain('The light Blackout is on, so the lights stay dark.')
        expect(out.text).toContain('The laser Blackout is on, so the cubes stay dark.')
        expect(r.calls).toHaveLength(2)
    })
})

describe('what the row can send', () => {
    it('only the light recall and this desk\'s Go: no arm, Blackout, Master, BPM or cube route in the rules or in the page block', () => {
        expect([row.LIGHT_API + row.RECALL_PATH, row.GO_PATH]).toEqual(['../light/api/scenes/recall', 'desk/api/go'])
        const rules = fs.readFileSync(path.join(here, 'sceneRow.js'), 'utf8')
        const desk = fs.readFileSync(path.join(here, 'desk.js'), 'utf8')
        const block = desk.slice(desk.indexOf('// ---- Scenes row'), desk.indexOf('    refreshThumbs()'))
        expect(block.length).toBeGreaterThan(1000)
        for (const source of [rules.replace(/^\s*\/\/.*$/gm, ''), block.replace(/^\s*\/\/.*$/gm, '')]) {
            expect(source).not.toMatch(/api\/(arm|alive|frame|blackout|master|bpm|cube|release|setting|follow|live|store|save|undo|redo)\b/)
            expect(source).not.toMatch(/desk\/api\/(?!go\b|follows\b)/) // the block reads desk/api/follows and posts desk/api/go: no other desk route
        }
    })
    it('the poll is once a second, not faster than the page\'s own polls (500 ms desk, 1 s engine)', () => {
        expect(row.POLL_MS).toBeGreaterThanOrEqual(1000)
        expect(row.LIGHT_TIMEOUT_MS).toBeGreaterThan(0)
    })
})
