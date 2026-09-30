// @vitest-environment node
// The scene deck's layer 1 (RIG_BUILD.md §21) over the REAL minimal-ground and full-ground show files, written
// into a document by the same ops scripts/rigbuild/looks.mjs and show-cues.mjs send. Pure logic: no UI, no
// network. What these prove is the data rules; nothing here has been seen on a screen.
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

import { applyProjectOps, normalizeProjectDocument } from '../../shared/projectSchema.js'
import { RIG_SHOW_ID } from '../rental.js'
import { groupKeys, rigLooksFrom } from '../../../scripts/rigbuild/looks.mjs'
import { cueOps, showCues } from '../../../scripts/rigbuild/show-loop.mjs'
import { BLINDER_GROUP, LASER_GROUP, LOOPS } from '../../../scripts/rigbuild/ground-scenes.mjs'
import { SceneDeckError } from './errors.js'
import { canonicalJson, sceneContent, sceneHash, sha256Hex } from './hash.js'
import { LOOP_RANGE_S, applyControl, guardSceneChange, isBlinderKey, isLaserKey, readScenes, spareSceneId } from './model.js'
import { createHistory, historyReducer } from './history.js'
import { compareScenes, labelledCopy, planSync, sceneOps, stateOf } from './sync.js'
import { BUNDLE_FORMAT, exportBundle, parseBundle } from './bundle.js'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')
const readJson = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))
const rigFile = (id) => `scripts/place/rigs/moxir-2026-10-17-${id}.json`
const showFile = (id) => `scripts/place/rigs/moxir-2026-10-17-${id}.show.json`

const documentOf = (id) => {
    const looks = rigLooksFrom(readJson(rigFile(id)), rigFile(id))
    const show = readJson(showFile(id))
    const entity = { id: RIG_SHOW_ID, type: 'group', name: 'the show', components: { transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] }, rigLooks: looks } }
    const withLooks = applyProjectOps(normalizeProjectDocument({}), [{ type: 'createEntity', payload: { entity } }])
    return applyProjectOps(withLooks, cueOps(withLooks, showCues(show), show.loop !== false))
}
const MIN = documentOf('minimal-ground')
const FULL = documentOf('full-ground')
const keys = groupKeys(readJson(rigFile('minimal-ground')))
const BLINDER = keys.get(BLINDER_GROUP)
const LASER = keys.get(LASER_GROUP)
const apply = (doc, ops) => applyProjectOps(doc, ops)
const named = (doc, name) => readScenes(doc).scenes.find((s) => s.name === name)
const hashes = (doc) => Object.fromEntries(readScenes(doc).scenes.map((s) => [s.id, sceneHash(s)]))
const r3 = (n) => Math.round(n * 1000) / 1000
const codeOf = (fn) => {
    try {
        fn()
    } catch (error) {
        return error instanceof SceneDeckError ? error.code : `untyped: ${error.message}`
    }
    return 'no error'
}
/** The document with one look's field (and/or one cue's field) removed: what must be equal when only that moved. */
const without = (doc, lookId, field, cueId, cueField) => {
    const d = JSON.parse(JSON.stringify(doc))
    // applyProjectOps itself stamps the project's updatedAt on every apply (the reducer's clock, not an op field)
    for (const v of Object.values(d)) if (v && typeof v === 'object' && 'createdAt' in v && 'updatedAt' in v) delete v.updatedAt
    if (lookId) delete d.entities.find((e) => e.id === RIG_SHOW_ID).components.rigLooks.looks.find((l) => l.id === lookId)[field]
    if (cueId) delete d.mappingState.cues.find((c) => c.id === cueId)[cueField]
    return d
}

describe('the model reads the real ground shows', () => {
    it('minimal-ground: the cue list in order, joined with its looks; the loop is 79 s', () => {
        const { scenes, loopSeconds, unjoined } = readScenes(MIN)
        const show = readJson(showFile('minimal-ground'))
        expect(scenes.filter((s) => s.inLoop).map((s) => [s.name, s.lookId, s.fade, s.hold])).toEqual(show.cues.map((c) => [c.name, c.look, c.fade, c.hold]))
        expect(loopSeconds).toBe(79)
        expect(loopSeconds).toBe(LOOPS['minimal-ground'].reduce((sum, c) => sum + c[2], 0))
        expect(unjoined).toEqual([])
        expect(scenes.filter((s) => !s.inLoop).map((s) => s.id)).toContain(spareSceneId('gs-laser-roof'))
    })
    it('full-ground: 10 scenes in the loop, 81 s; both loops sit inside 60-90 s', () => {
        const { scenes, loopSeconds } = readScenes(FULL)
        expect(scenes.filter((s) => s.inLoop)).toHaveLength(10)
        expect(loopSeconds).toBe(81)
        for (const s of [79, 81]) expect(s >= LOOP_RANGE_S.min && s <= LOOP_RANGE_S.max).toBe(true)
    })
    it('the blinder and the laser are found by type, and the flags follow the data', () => {
        expect([...keys.values()].filter(isBlinderKey)).toEqual([BLINDER])
        expect([...keys.values()].filter(isLaserKey)).toEqual([LASER])
        const { scenes } = readScenes(MIN)
        expect(scenes.filter((s) => s.inLoop && s.flags.strobe).map((s) => s.name)).toEqual(['Blinder hit'])
        expect(scenes.filter((s) => s.flags.requiresLaserSignOff).map((s) => s.lookId)).toEqual(['gs-laser-roof'])
        const red = named(MIN, 'Red room')
        expect(red.levels[keys.get('par-columns-8')]).toBe(0.5)
        expect(red.colours[keys.get('par-columns-8')]).toBe('#ff1408')
        expect(red.levels[LASER]).toBe(0)
    })
})

describe('the four controls: minimal ops on existing fields, nothing else moves', () => {
    const red = named(MIN, 'Red room')
    const others = (before, after, id) => Object.entries(before).filter(([k]) => k !== id).forEach(([k, h]) => expect(after[k]).toBe(h))
    it('intensity as a factor scales the lit groups of one look (clamped 0..1); dark stays dark', () => {
        const ops = applyControl(MIN, red.id, 'intensity', 0.5)
        expect(ops).toHaveLength(1)
        expect(ops[0]).toMatchObject({ type: 'updateComponent', payload: { entityId: RIG_SHOW_ID, component: 'rigLooks' } })
        expect(Object.keys(ops[0].payload.patch)).toEqual(['looks'])
        const after = apply(MIN, ops)
        for (const [g, v] of Object.entries(red.levels)) expect(named(after, 'Red room').levels[g]).toBe(r3(v * 0.5))
        expect(without(after, red.lookId, 'levels')).toEqual(without(MIN, red.lookId, 'levels'))
        others(hashes(MIN), hashes(after), red.id)
        const hot = named(apply(MIN, applyControl(MIN, red.id, 'intensity', 3)), 'Red room')
        for (const [g, v] of Object.entries(red.levels)) expect(hot.levels[g]).toBe(r3(Math.min(1, v * 3)))
        expect(hot.levels[LASER]).toBe(0)
    })
    it('intensity of one group, colour, speed and strobe each touch only their field', () => {
        const g = keys.get('par-press-cut')
        const one = apply(MIN, applyControl(MIN, red.id, 'intensity', { group: g, level: 0.9 }))
        expect(Object.entries(named(one, 'Red room').levels).filter(([k, v]) => v !== red.levels[k])).toEqual([[g, 0.9]])

        const white = apply(MIN, applyControl(MIN, red.id, 'colour', '#EEF3FF'))
        const now = named(white, 'Red room')
        for (const [k, v] of Object.entries(red.levels)) expect(now.colours[k]).toBe(v > 0 ? '#eef3ff' : red.colours[k])
        expect(without(white, red.lookId, 'colours')).toEqual(without(MIN, red.lookId, 'colours'))

        const ops = applyControl(MIN, red.id, 'speed', 2)
        expect(ops).toEqual([{ type: 'setMappingCue', payload: { cueId: red.id, patch: { fade: 2 } } }])
        const slow = apply(MIN, ops)
        expect(named(slow, 'Red room').fade).toBe(2)
        expect(without(slow, null, null, red.id, 'fade')).toEqual(without(MIN, null, null, red.id, 'fade'))
        expect(readScenes(slow).loopSeconds).toBe(79)
        expect(applyControl(MIN, red.id, 'speed', red.fade)).toEqual([])

        const cathedral = named(MIN, 'White cathedral')
        const lit = named(apply(MIN, applyControl(MIN, cathedral.id, 'strobe', true)), 'White cathedral')
        expect(lit.levels[BLINDER]).toBe(1)
        expect(lit.flags.strobe).toBe(true)
        expect(Object.entries(lit.levels).filter(([k, v]) => v !== cathedral.levels[k]).map(([k]) => k)).toEqual([BLINDER])
        const hit = named(MIN, 'Blinder hit')
        const off = named(apply(MIN, applyControl(MIN, hit.id, 'strobe', false)), 'Blinder hit')
        expect([off.levels[BLINDER], off.flags.strobe]).toEqual([0, false])
    })
    it('refuses bad input with a typed reason', () => {
        const laser = spareSceneId('gs-laser-roof')
        expect(codeOf(() => applyControl(MIN, 'nope', 'intensity', 1))).toBe('unknown-scene')
        expect(codeOf(() => applyControl(MIN, red.id, 'hue', 1))).toBe('unknown-control')
        expect(codeOf(() => applyControl(MIN, red.id, 'intensity', Number.NaN))).toBe('bad-value')
        expect(codeOf(() => applyControl(MIN, red.id, 'colour', 'red'))).toBe('bad-value')
        expect(codeOf(() => applyControl(MIN, red.id, 'strobe', 'on'))).toBe('bad-value')
        expect(codeOf(() => applyControl(MIN, red.id, 'intensity', { group: 'x/y', level: 1 }))).toBe('unknown-group')
        expect(codeOf(() => applyControl(MIN, laser, 'speed', 2))).toBe('not-in-loop')
        expect(codeOf(() => applyControl(MIN, red.id, 'speed', 13))).toBe('fade-longer-than-hold')
    })
    it('laser guard: no laser is lit in a scene without requiresLaserSignOff', () => {
        expect(codeOf(() => applyControl(MIN, red.id, 'intensity', { group: LASER, level: 0.5 }))).toBe('laser-sign-off')
        const laser = spareSceneId('gs-laser-roof')
        expect(readScenes(MIN).scenes.find((s) => s.id === laser).levels[LASER]).toBe(0) // dark in the data (cap review A2-1); a flagged scene may be raised
        expect(applyControl(MIN, laser, 'intensity', { group: LASER, level: 0.3 })).toHaveLength(1)
        expect(applyControl(MIN, laser, 'intensity', 0.5)).toHaveLength(1)
    })
    it('mover guard: no control on any scene of either show changes an aim; a change that would is refused', () => {
        for (const doc of [MIN, FULL]) {
            const before = readScenes(doc).scenes
            for (const s of before) {
                for (const [control, value] of [['intensity', 0.7], ['colour', '#ff1408'], ['speed', 0], ['strobe', true], ['strobe', false]]) {
                    let ops
                    try {
                        ops = applyControl(doc, s.id, control, value)
                    } catch (error) {
                        expect(['not-in-loop', 'no-blinder']).toContain(error.code)
                        continue
                    }
                    const after = readScenes(apply(doc, ops)).scenes
                    for (const b of before) expect(canonicalJson(after.find((x) => x.lookId === b.lookId).look.aims)).toBe(canonicalJson(b.look.aims))
                }
            }
        }
        const looks = JSON.parse(JSON.stringify(MIN.entities.find((e) => e.id === RIG_SHOW_ID).components.rigLooks.looks))
        looks.find((l) => l.id === red.lookId).aims[keys.get('beam380-columns-6')] = { rule: 'vertical', in_deg: 80 }
        const op = { type: 'updateComponent', payload: { entityId: RIG_SHOW_ID, component: 'rigLooks', patch: { looks } } }
        expect(codeOf(() => guardSceneChange(MIN, [op], red.id))).toBe('mover-policy')
    })
    it('loop guard: a change that takes the loop out of 60-90 s is refused', () => {
        const hold = (h) => [{ type: 'setMappingCue', payload: { cueId: red.id, patch: { hold: h } } }]
        expect(codeOf(() => guardSceneChange(MIN, hold(42), red.id))).toBe('loop-length') // 109 s
        expect(codeOf(() => guardSceneChange(MIN, hold(0), red.id))).toBe('loop-length') // stops at GO: 56 s
        expect(readScenes(guardSceneChange(MIN, hold(20), red.id)).loopSeconds).toBe(87)
    })
})

describe('the per-scene hash', () => {
    it('is SHA-256, checked against node:crypto', () => {
        const texts = ['', 'abc', 'a'.repeat(55), 'a'.repeat(56), 'a'.repeat(64), 'a'.repeat(1000), 'Հայերեն ünïcødé', canonicalJson(sceneContent(named(MIN, 'Red room')))]
        for (const t of texts) expect(sha256Hex(t)).toBe(crypto.createHash('sha256').update(t, 'utf8').digest('hex'))
        expect(sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
    })
    it('is stable under key order and number noise', () => {
        const red = named(MIN, 'Red room')
        const reversed = (v) => (Array.isArray(v) ? v.map(reversed) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).reverse().map((k) => [k, reversed(v[k])])) : v)
        expect(sceneHash(reversed(red))).toBe(sceneHash(red))
        expect(sceneHash({ ...red, fade: 0.1 + 0.2 })).toBe(sceneHash({ ...red, fade: 0.3 }))
        expect(sceneHash({ ...red, fade: -0 })).toBe(sceneHash({ ...red, fade: 0 }))
        expect(new Set(Object.values(hashes(MIN))).size).toBe(readScenes(MIN).scenes.length)
    })
    it('ignores what is not the scene: timestamps, documentVersion, the other scenes', () => {
        const before = hashes(MIN)
        const doc = JSON.parse(JSON.stringify(MIN))
        Object.assign(doc, { version: 999, documentVersion: 999, updatedAt: '2031-01-01T00:00:00Z' })
        Object.assign(doc.entities.find((e) => e.id === RIG_SHOW_ID).components.rigLooks, { writtenAt: '2031-01-01', source: 'another install' })
        expect(hashes(doc)).toEqual(before)
        const red = named(MIN, 'Red room')
        const after = hashes(apply(MIN, applyControl(MIN, red.id, 'intensity', 0.5)))
        for (const [id, h] of Object.entries(before)) expect([id, after[id] === h]).toEqual([id, id !== red.id])
    })
})

// Here changes Red room, there changes Slow fan, both change White cathedral, each adds one scene of its own.
const scenario = () => {
    const [red, fan, cathedral] = ['Red room', 'Slow fan', 'White cathedral'].map((n) => named(MIN, n))
    let here = apply(MIN, applyControl(MIN, red.id, 'intensity', 0.5))
    here = apply(here, applyControl(here, cathedral.id, 'colour', '#ff1408'))
    here = apply(here, sceneOps(here, { kind: 'addCopy', scene: labelledCopy(fan, 'here') }))
    let there = apply(MIN, applyControl(MIN, fan.id, 'speed', 2))
    there = apply(there, applyControl(there, cathedral.id, 'intensity', 0.4))
    there = apply(there, sceneOps(there, { kind: 'addCopy', scene: labelledCopy(red, 'there') }))
    const status = compareScenes(readScenes(here).scenes, readScenes(there).scenes, hashes(MIN))
    return { red, fan, cathedral, here, there, status, of: (id) => status.find((s) => s.id === id) }
}

describe('the three-way compare (here, there, the last common hashes)', () => {
    it('the decision table, every case', () => {
        const rows = [
            ['a', 'a', 'a', 'same'], ['a', 'a', null, 'same'], ['b', 'a', 'a', 'changedHere'], ['a', 'b', 'a', 'changedThere'],
            ['b', 'c', 'a', 'changedBoth'], ['b', 'c', null, 'changedBoth'], ['a', null, null, 'onlyHere'], [null, 'a', null, 'onlyThere'],
            ['a', null, 'a', 'changedThere'], ['b', null, 'a', 'changedBoth'], [null, 'a', 'a', 'changedHere'], [null, 'b', 'a', 'changedBoth'],
            [null, null, 'a', 'same']
        ]
        for (const [h, t, a, want] of rows) expect([h, t, a, stateOf(h, t, a)]).toEqual([h, t, a, want])
    })
    it('on the real show: changed here, changed there, changed on both, only here, only there, the rest same', () => {
        const { red, fan, cathedral, status, of } = scenario()
        expect(of(red.id).state).toBe('changedHere')
        expect(of(fan.id).state).toBe('changedThere')
        expect(of(cathedral.id).state).toBe('changedBoth')
        expect(of(spareSceneId('gs-slow-fan-here')).state).toBe('onlyHere')
        expect(of(spareSceneId('gs-red-room-there')).state).toBe('onlyThere')
        expect(status.filter((s) => s.state === 'same')).toHaveLength(readScenes(MIN).scenes.length - 3)
    })
    it('a timestamp or a version never decides: bumping them on one copy changes no state', () => {
        const there = JSON.parse(JSON.stringify(MIN))
        Object.assign(there, { version: 1e6, updatedAt: '2099-01-01T00:00:00Z' })
        there.entities.find((e) => e.id === RIG_SHOW_ID).components.rigLooks.writtenAt = '2099-01-01'
        expect(compareScenes(readScenes(MIN).scenes, readScenes(there).scenes, hashes(MIN)).every((s) => s.state === 'same')).toBe(true)
    })
})

describe('planSync: take theirs, keep mine, keep both', () => {
    it('anything of theirs is written only after a restore point; changed on both asks', () => {
        const { status } = scenario()
        for (const st of status) {
            for (const choice of [undefined, 'takeTheirs', 'keepMine', 'keepBoth']) {
                let actions
                try {
                    actions = planSync(st, choice)
                } catch (error) {
                    expect([error.code, st.state, choice]).toEqual(['choice-needed', 'changedBoth', undefined])
                    continue
                }
                const write = actions.findIndex((a) => a.kind === 'applyTheirs' || a.kind === 'addCopy')
                const restore = actions.findIndex((a) => a.kind === 'restorePoint')
                if (write !== -1) expect(restore >= 0 && restore < write).toBe(true)
            }
        }
    })
    it('take theirs makes the scene here equal theirs; restore last good takes it back', () => {
        const { fan, here, of } = scenario()
        const actions = planSync(of(fan.id))
        expect(actions.map((a) => a.kind)).toEqual(['restorePoint', 'applyTheirs', 'setBase'])
        const tookOps = actions.flatMap((a) => sceneOps(here, a))
        const took = apply(here, tookOps)
        const hist = historyReducer(historyReducer(createHistory(), { type: 'markGood', document: here }), { type: 'record', document: here, ops: tookOps })
        expect(hashes(took)[fan.id]).toBe(of(fan.id).thereHash)
        expect(readScenes(took).loopSeconds).toBe(79)
        const back = historyReducer(hist, { type: 'restoreGood', document: took })
        expect(hashes(apply(took, back.out))).toEqual(hashes(here))
        const onlyThere = of(spareSceneId('gs-red-room-there'))
        const got = apply(here, planSync(onlyThere).flatMap((a) => sceneOps(here, a)))
        expect(hashes(got)[onlyThere.id]).toBe(onlyThere.thereHash)
    })
    it('keep both: theirs becomes a labelled copy outside the loop; the loop length and mine are unchanged', () => {
        const { cathedral, here, of } = scenario()
        const actions = planSync(of(cathedral.id), 'keepBoth')
        expect(actions.map((a) => a.kind)).toEqual(['restorePoint', 'addCopy', 'setBase'])
        const both = apply(here, actions.flatMap((a) => sceneOps(here, a)))
        expect(readScenes(both).loopSeconds).toBe(readScenes(here).loopSeconds)
        const copy = named(both, 'White cathedral (there)')
        expect([copy.inLoop, copy.levels, copy.colours]).toEqual([false, of(cathedral.id).there.look.levels, of(cathedral.id).there.look.colours])
        expect(hashes(both)[cathedral.id]).toBe(of(cathedral.id).hereHash)
        expect(planSync(of(cathedral.id), 'keepMine').flatMap((a) => sceneOps(here, a))).toEqual([])
    })
})

describe('history: undo, redo, restore last good', () => {
    const red = named(MIN, 'Red room')
    it('undo sends the inverse ops, redo the ops again; the history is bounded', () => {
        const ops = applyControl(MIN, red.id, 'colour', '#eef3ff')
        const changed = apply(MIN, ops)
        let h = historyReducer(createHistory(3), { type: 'record', document: MIN, ops })
        h = historyReducer(h, { type: 'undo', document: changed })
        const undone = apply(changed, h.out)
        expect(hashes(undone)).toEqual(hashes(MIN))
        h = historyReducer(h, { type: 'redo', document: undone })
        expect(hashes(apply(undone, h.out))).toEqual(hashes(changed))
        let b = createHistory(3)
        for (let i = 0; i < 5; i += 1) b = historyReducer(b, { type: 'record', document: MIN, ops })
        expect(b.past).toHaveLength(3)
        expect(historyReducer(createHistory(), { type: 'undo' }).out).toEqual([])
    })
    it('restore last good is one batch back to the snapshot, and can itself be undone', () => {
        const fan = named(MIN, 'Slow fan')
        let h = historyReducer(createHistory(), { type: 'markGood', document: MIN })
        let doc = MIN
        for (const [id, control, value] of [[red.id, 'intensity', 0.2], [fan.id, 'speed', 1]]) {
            const ops = applyControl(doc, id, control, value)
            h = historyReducer(h, { type: 'record', document: doc, ops })
            doc = apply(doc, ops)
        }
        h = historyReducer(h, { type: 'restoreGood', document: doc })
        const back = apply(doc, h.out)
        expect(hashes(back)).toEqual(hashes(MIN))
        expect(readScenes(back).loopSeconds).toBe(79)
        h = historyReducer(h, { type: 'undo', document: back })
        expect(hashes(apply(back, h.out))).toEqual(hashes(doc))
    })
})

describe('the carried file (di.scenes/1)', () => {
    const bundle = exportBundle(MIN, { project: 'moxir-hall-minimal-ground', exportedAt: '2026-09-30T20:00:00Z', lastSync: hashes(MIN) })
    const text = JSON.stringify(bundle)
    it('round-trips, and a read file compares like the copy it came from', () => {
        expect(bundle.format).toBe(BUNDLE_FORMAT)
        const read = parseBundle(text)
        expect(read).toEqual(bundle)
        expect(compareScenes(readScenes(MIN).scenes, read.scenes, read.lastSync).every((s) => s.state === 'same')).toBe(true)
        const { here, there } = scenario()
        const carried = parseBundle(JSON.stringify(exportBundle(there, { lastSync: hashes(MIN) })))
        const states = compareScenes(readScenes(here).scenes, carried.scenes, carried.lastSync).map((s) => s.state)
        expect(new Set(states)).toEqual(new Set(['same', 'changedHere', 'changedThere', 'changedBoth', 'onlyHere', 'onlyThere']))
    })
    it('rejects garbage, oversize, the wrong format, duplicate ids, non-finite numbers and a changed scene', () => {
        const bad = (mutate) => {
            const b = JSON.parse(text)
            mutate(b)
            return JSON.stringify(b)
        }
        expect(codeOf(() => parseBundle(42))).toBe('bundle-not-text')
        expect(codeOf(() => parseBundle('not json'))).toBe('bundle-not-json')
        expect(codeOf(() => parseBundle(' '.repeat(600 * 1024)))).toBe('bundle-oversize')
        expect(codeOf(() => parseBundle('[]'))).toBe('bundle-bad-field')
        expect(codeOf(() => parseBundle(bad((b) => { b.format = 'di.scenes/2' })))).toBe('bundle-wrong-format')
        expect(codeOf(() => parseBundle(bad((b) => { b.scenes.push(b.scenes[0]) })))).toBe('bundle-duplicate-id')
        expect(codeOf(() => parseBundle(text.replace('"fade":0,', '"fade":1e999,')))).toBe('bundle-non-finite')
        expect(codeOf(() => parseBundle(bad((b) => { b.scenes[1].scene.hold = 11 })))).toBe('bundle-hash-mismatch')
        expect(codeOf(() => parseBundle(bad((b) => { b.extra = 1 })))).toBe('bundle-bad-field')
        expect(codeOf(() => parseBundle(bad((b) => { b.scenes[0].scene.look.colours.x = 'red' })))).toBe('bundle-bad-field')
        expect(codeOf(() => parseBundle(bad((b) => { b.lastSync = { x: 'not a hash' } })))).toBe('bundle-bad-field')
    })
})

// --- the review fixes (A3 1-6, 2026-09-30): each of these failed on the code before ---
const withLookChange = (doc, lookId, change) => {
    const entity = doc.entities.find((e) => e.id === RIG_SHOW_ID)
    return apply(doc, [{ type: 'updateComponent', payload: { entityId: RIG_SHOW_ID, component: 'rigLooks', patch: { looks: entity.components.rigLooks.looks.map((l) => (l.id === lookId ? change(JSON.parse(JSON.stringify(l))) : l)) } } }])
}
const takeOps = (here, there, id) => {
    const status = compareScenes(readScenes(here).scenes, readScenes(there).scenes, {}).find((s) => s.id === id)
    return planSync({ ...status, state: 'changedThere' }, 'takeTheirs').flatMap((a) => sceneOps(here, a))
}

describe('review A3-1: a laser sign-off is never accepted from the incoming side, and is a token', () => {
    const red = named(MIN, 'Red room')
    const lit = (l) => ({ ...l, intent: `${l.intent} requiresLaserSignOff`, levels: { ...l.levels, [LASER]: 1 } })
    it('a laser lit by a carried copy that brings its own marker is refused', () => {
        const there = withLookChange(MIN, red.lookId, lit)
        const here = withLookChange(MIN, red.lookId, (l) => ({ ...l, intent: String(l.intent).replaceAll('requiresLaserSignOff', '') }))
        expect(readScenes(there).scenes.find((s) => s.id === red.id).flags.requiresLaserSignOff).toBe(true)
        expect(codeOf(() => guardSceneChange(here, takeOps(here, there, red.id), red.id))).toBe('laser-sign-off')
    })
    it('the same change is accepted when the scene here already carried the marker before the ops', () => {
        const there = withLookChange(MIN, red.lookId, lit)
        const here = withLookChange(MIN, red.lookId, (l) => ({ ...l, intent: `${l.intent} requiresLaserSignOff` }))
        expect(codeOf(() => guardSceneChange(here, takeOps(here, there, red.id), red.id))).toBe('no error')
    })
    it('the marker matches as a whole token, not as a substring', () => {
        const flagged = (intent) => readScenes(withLookChange(MIN, red.lookId, (l) => ({ ...l, intent }))).scenes.find((s) => s.id === red.id).flags.requiresLaserSignOff
        expect(flagged('xrequiresLaserSignOffx')).toBe(false)
        expect(flagged('prefix_requiresLaserSignOff')).toBe(false)
        expect(flagged('laser: requiresLaserSignOff.')).toBe(true)
    })
})

describe('review A3-2: keep both decides once and never adds an identical copy', () => {
    it('three keep-boths against the same "there" leave one copy and a recorded base', () => {
        const { cathedral, here, there } = scenario()
        let doc = here
        let lastCommon = hashes(MIN)
        for (const label of ['there 10:00', 'there 10:05', 'there 10:10']) {
            const status = compareScenes(readScenes(doc).scenes, readScenes(there).scenes, lastCommon).find((s) => s.id === cathedral.id)
            if (label !== 'there 10:00') expect(status.state).not.toBe('changedBoth') // not asked again
            else expect(status.state).toBe('changedBoth')
            // a fresh ask with the same pair (a person who had not seen the base) still adds nothing more
            const actions = planSync({ ...status, state: 'changedBoth' }, 'keepBoth', { label })
            doc = apply(doc, actions.flatMap((a) => sceneOps(doc, a)))
            lastCommon = { ...lastCommon, ...Object.fromEntries(actions.filter((a) => a.kind === 'setBase').map((a) => [a.id, a.hash])) }
        }
        expect(readScenes(doc).scenes.filter((s) => s.name.startsWith('White cathedral (there'))).toHaveLength(1)
    })
})

describe('review A3-3 / A4-1: undo and restore refuse when the looks or cues changed elsewhere', () => {
    const red = named(MIN, 'Red room')
    const fan = named(MIN, 'Slow fan')
    it('undo does not revert a colleague\'s later colour on another look', () => {
        const ops = applyControl(MIN, red.id, 'intensity', 0.5)
        const mine = apply(MIN, ops)
        let h = historyReducer(createHistory(), { type: 'record', document: MIN, ops })
        const theirs = apply(mine, applyControl(mine, fan.id, 'colour', '#123456'))
        h = historyReducer(h, { type: 'undo', document: theirs })
        expect(h.out).toEqual([])
        expect(h.refused).toMatch(/changed elsewhere/)
        expect(h.past).toHaveLength(1) // the step stays, nothing was spent
        expect(historyReducer(h, { type: 'undo', document: mine }).out).toHaveLength(1) // and it still works when nothing moved
    })
    it('restore last good refuses when a colleague added a cue since the snapshot', () => {
        const h0 = historyReducer(createHistory(), { type: 'markGood', document: MIN })
        const colleague = apply(MIN, [{ type: 'createMappingCue', payload: { cue: { id: 'cue-colleague', name: 'Theirs', fade: 0, hold: 5, lightLook: readScenes(MIN).scenes[0].cue ? MIN.mappingState.cues[0].lightLook : '' } } }])
        const h = historyReducer(h0, { type: 'restoreGood', document: colleague })
        expect(h.out).toEqual([])
        expect(h.refused).toMatch(/changed elsewhere/)
    })
    it('guardSceneChange with no scene id checks every scene (a restore that lights an unsigned laser is refused)', () => {
        const lit = withLookChange(MIN, red.lookId, (l) => ({ ...l, levels: { ...l.levels, [LASER]: 1 } }))
        const ops = [{ type: 'updateComponent', payload: { entityId: RIG_SHOW_ID, component: 'rigLooks', patch: { looks: lit.entities.find((e) => e.id === RIG_SHOW_ID).components.rigLooks.looks } } }]
        expect(codeOf(() => guardSceneChange(MIN, ops, null))).toBe('laser-sign-off')
    })
})

describe('review A3-4: a taken fade stays inside its hold', () => {
    it('take theirs with fade 40 on a 12 s hold is refused by the guard', () => {
        const red = named(MIN, 'Red room')
        const there = apply(MIN, [{ type: 'setMappingCue', payload: { cueId: red.id, patch: { fade: 40 } } }])
        expect(codeOf(() => guardSceneChange(MIN, takeOps(MIN, there, red.id), red.id))).toBe('fade-longer-than-hold')
    })
})

describe('review A3-5 / A3-6: hostile files fail typed', () => {
    it('a deeply nested file is a bundle error, not a RangeError', () => {
        const deep = `${'['.repeat(20000)}${']'.repeat(20000)}`
        expect(codeOf(() => parseBundle(`{"format":"${BUNDLE_FORMAT}","x":${deep}}`))).toBe('bundle-bad-field')
        expect(codeOf(() => parseBundle(`{"format":"${BUNDLE_FORMAT}","project":"p","exportedAt":"t","scenes":${deep},"lastSync":{}}`))).toBe('bundle-bad-field')
    })
    it('a number past 1e9 is refused, never hashed as null', () => {
        expect(codeOf(() => canonicalJson({ a: 1e303 }))).toBe('non-finite')
        const bundle = exportBundle(MIN, { project: 'p', exportedAt: '2026-09-30T20:00:00Z', lastSync: {} })
        expect(codeOf(() => parseBundle(JSON.stringify(bundle).replace('"fade":0,', '"fade":1e303,')))).toBe('bundle-non-finite')
    })
})
