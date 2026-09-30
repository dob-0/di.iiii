// The scene deck's layer 2 (RIG_BUILD.md §22): screens A and B over the REAL minimal-ground show, written into
// a document by the same ops scripts/rigbuild/looks.mjs and show-cues.mjs send. jsdom + testing-library: what
// these prove is what the page WRITES and what it SAYS, and that its stylesheet gives every control 44 px and
// 2 px corners. Nothing here has been seen on a real screen.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { useState } from 'react'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import { applyProjectOps, normalizeProjectDocument } from '../shared/projectSchema.js'
import { RIG_SHOW_ID } from './rental.js'
import { rigLooksFrom } from '../../scripts/rigbuild/looks.mjs'
import { cueOps, showCues } from '../../scripts/rigbuild/show-loop.mjs'
import { SIGN_OFF_MARKER, intensityOf, isBlinderKey, isLaserKey, looksOp, readScenes, showEntityOf } from './sceneDeck/model.js'
import { sceneHash } from './sceneDeck/hash.js'
import { exportBundle, parseBundle } from './sceneDeck/bundle.js'
import { ledgerKey, readLedger, writeBases } from './sceneDeck/ledger.js'
import { MAX_PREVIEW_FLASHES_PER_S, playingAt, previewFlashOn, timelineOf } from './sceneDeck/preview.js'
import ScenesDeck, { OFFLINE_SENTENCE } from './ScenesDeck.jsx'
import { buildScenesPath, getScenesLocationState } from './scenesRouting.js'
import { rigRow } from './rigTools.js'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const readJson = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))
const RIG = 'scripts/place/rigs/moxir-2026-10-17-minimal-ground.json'
const SHOW = 'scripts/place/rigs/moxir-2026-10-17-minimal-ground.show.json'
const PROJECT = 'moxir-minimal'

const documentOf = () => {
    const looks = rigLooksFrom(readJson(RIG), RIG)
    const show = readJson(SHOW)
    const entity = { id: RIG_SHOW_ID, type: 'group', name: 'the show', components: { transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] }, rigLooks: looks } }
    const withLooks = applyProjectOps(normalizeProjectDocument({}), [{ type: 'createEntity', payload: { entity } }])
    return applyProjectOps(withLooks, cueOps(withLooks, showCues(show), show.loop !== false))
}
const MIN = documentOf()
const scenesOf = (doc) => readScenes(doc).scenes
const named = (doc, name) => scenesOf(doc).find((s) => s.name === name)
const hashes = (doc) => Object.fromEntries(scenesOf(doc).map((s) => [s.id, sceneHash(s)]))
const lookOf = (doc, lookId) => showEntityOf(doc).components.rigLooks.looks.find((l) => l.id === lookId)
const othersOf = (doc, lookId) => showEntityOf(doc).components.rigLooks.looks.filter((l) => l.id !== lookId)
/** A document with one look replaced (the op looks.mjs sends). */
const withLook = (doc, lookId, change) => {
    const entity = showEntityOf(doc)
    return applyProjectOps(doc, [looksOp(entity.id, entity.components.rigLooks.looks.map((l) => (l.id === lookId ? change(JSON.parse(JSON.stringify(l))) : l)))])
}
const withCue = (doc, cueId, patch) => applyProjectOps(doc, [{ type: 'setMappingCue', payload: { cueId, patch } }])

const memoryStorage = () => {
    const m = new Map()
    return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), map: m }
}

/** The page with a live document: every op the page sends is logged and applied. */
function Harness({ start, log, ...props }) {
    const [doc, setDoc] = useState(start)
    Harness.current = () => doc
    Harness.set = setDoc
    return <ScenesDeck doc={doc} applyOps={(ops) => { log.push(ops); setDoc((d) => applyProjectOps(d, ops)) }} projectId={PROJECT} reducedMotion {...props} />
}
const mount = (start = MIN, props = {}) => {
    const log = []
    const storage = props.storage || memoryStorage()
    const utils = render(<Harness start={start} log={log} storage={storage} {...props} />)
    return { ...utils, log, storage, doc: () => Harness.current() }
}
const pick = (name) => fireEvent.click(screen.getAllByRole('button').find((b) => b.classList.contains('rigscenes-tile') && b.textContent.includes(name)))
const status = () => screen.getByRole('status', { name: 'what happened' }).textContent
const fileOf = (text, name = 'there.scenes.json') => new File([text], name, { type: 'application/json' })
const readFile = async (text, name) => {
    const input = screen.getByTestId('scenes-file')
    await act(async () => { fireEvent.change(input, { target: { files: [fileOf(text, name)] } }) })
}
const bundleText = (doc, lastSync = {}) => JSON.stringify(exportBundle(doc, { project: PROJECT, exportedAt: '2026-09-30T10:00:00.000Z', lastSync }))
const strip = () => screen.getByRole('region', { name: 'Sync with the other copy' })
const rowOf = (name) => within(strip()).getAllByRole('listitem').find((li) => li.textContent.includes(name))

// jsdom has no 2D canvas: the preview paints nothing here (it guards a null context) and says what it shows in
// its aria-label instead. Stubbed so jsdom does not print "not implemented" once per render.
beforeAll(() => { vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null) })
afterEach(() => { cleanup() })

// The scenes this file edits, found by what they hold (not by position).
const LIT = named(MIN, 'Red room')
const HIT = scenesOf(MIN).find((s) => s.inLoop && Object.keys(s.levels).some(isBlinderKey))
const LASER_SCENE = scenesOf(MIN).find((s) => s.flags.requiresLaserSignOff)

describe('the data this file stands on', () => {
    it('minimal-ground: a lit scene, a scene with the blinder, a laser scene with the sign-off', () => {
        expect(intensityOf(LIT)).toBeGreaterThan(0)
        expect(HIT).toBeTruthy()
        expect(LASER_SCENE).toBeTruthy()
        // the laser is written at 0 in every look (cap review A2-1); the scene still carries the sign-off flag
        expect(Object.entries(LASER_SCENE.levels).filter(([g]) => isLaserKey(g)).every(([, v]) => v === 0)).toBe(true)
        expect(LASER_SCENE.flags.requiresLaserSignOff).toBe(true)
        expect(readScenes(MIN).loopSeconds).toBe(79)
    })
})

describe('A: the four controls write exactly their fields', () => {
    it('intensity: one rigLooks op, only that look\'s levels move, its brightest group lands on the slider', () => {
        const { log, doc } = mount()
        pick('Red room')
        const slider = screen.getByLabelText('Red room intensity')
        fireEvent.change(slider, { target: { value: '50' } })
        expect(log).toHaveLength(0) // nothing is written while the slider moves
        fireEvent.keyUp(slider)
        expect(log).toHaveLength(1)
        expect(log[0]).toHaveLength(1)
        expect(log[0][0]).toMatchObject({ type: 'updateComponent', payload: { entityId: RIG_SHOW_ID, component: 'rigLooks' } })
        const was = lookOf(MIN, LIT.lookId)
        const is = lookOf(doc(), LIT.lookId)
        expect(is.colours).toEqual(was.colours)
        expect(is.aims).toEqual(was.aims)
        expect(is.intent).toEqual(was.intent)
        expect(intensityOf(named(doc(), 'Red room'))).toBeCloseTo(0.5, 3)
        expect(othersOf(doc(), LIT.lookId)).toEqual(othersOf(MIN, LIT.lookId))
        expect(doc().mappingState.cues).toEqual(MIN.mappingState.cues)
    })
    it('colour: every lit group takes the hex; levels, aims and the cues do not move', () => {
        const { log, doc } = mount()
        pick('Red room')
        fireEvent.click(screen.getByLabelText('Red room colour #0044ff'))
        expect(log).toHaveLength(1)
        const is = lookOf(doc(), LIT.lookId)
        const was = lookOf(MIN, LIT.lookId)
        for (const [g, v] of Object.entries(LIT.levels)) if (v > 0) expect(is.colours[g]).toBe('#0044ff')
        expect(is.levels).toEqual(was.levels)
        expect(is.aims).toEqual(was.aims)
        expect(othersOf(doc(), LIT.lookId)).toEqual(othersOf(MIN, LIT.lookId))
        expect(doc().mappingState.cues).toEqual(MIN.mappingState.cues)
    })
    it('speed: one setMappingCue op with the fade, nothing else', () => {
        const { log, doc } = mount()
        pick('Red room')
        const slider = screen.getByLabelText('Red room speed, fade in seconds')
        fireEvent.change(slider, { target: { value: '2.5' } })
        fireEvent.blur(slider)
        expect(log).toEqual([[{ type: 'setMappingCue', payload: { cueId: LIT.id, patch: { fade: 2.5 } } }]])
        expect(showEntityOf(doc()).components.rigLooks).toEqual(showEntityOf(MIN).components.rigLooks)
    })
    it('strobe: only the blinder group\'s level toggles', () => {
        const { log, doc } = mount()
        pick(HIT.name)
        const button = screen.getByLabelText(`${HIT.name} strobe`)
        expect(button.getAttribute('aria-pressed')).toBe(String(HIT.flags.strobe))
        fireEvent.click(button)
        expect(log).toHaveLength(1)
        const was = lookOf(MIN, HIT.lookId)
        const is = lookOf(doc(), HIT.lookId)
        for (const g of Object.keys(HIT.levels)) {
            if (isBlinderKey(g)) expect(is.levels[g]).toBe(HIT.flags.strobe ? 0 : 1)
            else expect(is.levels?.[g]).toEqual(was.levels?.[g])
        }
        expect(is.colours).toEqual(was.colours)
        expect(screen.getByLabelText(`${HIT.name} strobe`).getAttribute('aria-pressed')).toBe(String(!HIT.flags.strobe))
    })
    it('a scene outside the loop has no speed; a scene with no blinder has no strobe', () => {
        mount()
        pick(LASER_SCENE.name)
        expect(screen.getByLabelText(`${LASER_SCENE.name} speed, fade in seconds`).disabled).toBe(true)
        pick('Red room')
        expect(screen.getByLabelText('Red room strobe').disabled).toBe(Object.keys(LIT.levels).some(isBlinderKey) === false)
    })
})

describe('a write layer 1 refuses shows in words and writes nothing', () => {
    it('laser: a lit laser without the sign-off', () => {
        const unsigned = withLook(MIN, LASER_SCENE.lookId, (l) => ({ ...l, intent: String(l.intent).replaceAll(SIGN_OFF_MARKER, ''), levels: Object.fromEntries(Object.entries(l.levels).map(([g, v]) => [g, isLaserKey(g) ? 0.6 : v])) }))
        const { log } = mount(unsigned)
        pick(LASER_SCENE.name)
        fireEvent.click(screen.getByLabelText(`${LASER_SCENE.name} colour #ff0000`))
        expect(log).toHaveLength(0)
        expect(status()).toMatch(/^Refused: this would light a laser without the laser safety sign-off\..*Nothing was written\.$/)
    })
    it('mover policy: taking a scene from there whose aims differ', async () => {
        const firstAim = Object.keys(LIT.look.aims)[0]
        const there = withLook(MIN, LIT.lookId, (l) => ({ ...l, aims: { ...l.aims, [firstAim]: { ...l.aims[firstAim], rule: 'tilt-up' } } }))
        const { log } = mount(MIN, { storage: seeded(hashes(MIN)) })
        await readFile(bundleText(there))
        fireEvent.click(within(rowOf('Red room')).getByRole('button', { name: 'TAKE THEIRS' }))
        expect(log).toHaveLength(0)
        expect(status()).toMatch(/^Refused: this would move a lamp's aim\..*Nothing was written\.$/)
        expect(screen.getByRole('button', { name: /RESTORE LAST GOOD/ }).textContent).toContain('file read') // one restore point per file read, kept before any take
    })
    it('loop length: taking a hold that pushes the loop past 90 s', async () => {
        const there = withCue(MIN, LIT.id, { hold: LIT.hold + 20 })
        const { log } = mount(MIN, { storage: seeded(hashes(MIN)) })
        await readFile(bundleText(there))
        fireEvent.click(within(rowOf('Red room')).getByRole('button', { name: 'TAKE THEIRS' }))
        expect(log).toHaveLength(0)
        expect(status()).toBe('Refused: the loop would be 99 s, outside 60-90 s. Nothing was written.')
    })
})

describe('undo and restore last good', () => {
    it('undo sends the inverse: the scene is as it was', () => {
        const { log, doc } = mount()
        pick('Red room')
        fireEvent.click(screen.getByLabelText('Red room colour #00ff66'))
        expect(sceneHash(named(doc(), 'Red room'))).not.toBe(sceneHash(LIT))
        fireEvent.click(screen.getByRole('button', { name: 'UNDO' }))
        expect(log).toHaveLength(2)
        expect(hashes(doc())).toEqual(hashes(MIN))
        expect(status()).toBe('Undid the last change.')
        expect(screen.getByRole('button', { name: 'UNDO' }).disabled).toBe(true)
    })
    it('restore last good: two changes back to the show as opened, in one batch', () => {
        const { log, doc } = mount()
        pick('Red room')
        fireEvent.click(screen.getByLabelText('Red room colour #00ff66'))
        const speed = screen.getByLabelText('Red room speed, fade in seconds')
        fireEvent.change(speed, { target: { value: '1' } })
        fireEvent.keyUp(speed)
        expect(log).toHaveLength(2)
        fireEvent.click(screen.getByRole('button', { name: /RESTORE LAST GOOD/ }))
        expect(log).toHaveLength(3)
        expect(hashes(doc())).toEqual(hashes(MIN))
        expect(status()).toBe('Restored the last good state (as opened).')
    })
    it('mark this as good moves the restore target', () => {
        const { doc } = mount(MIN, { now: () => new Date('2026-09-30T10:31:00') })
        pick('Red room')
        fireEvent.click(screen.getByLabelText('Red room colour #00ff66'))
        const marked = hashes(doc())
        fireEvent.click(screen.getByRole('button', { name: 'MARK THIS AS GOOD' }))
        fireEvent.click(screen.getByLabelText('Red room colour #0044ff'))
        fireEvent.click(screen.getByRole('button', { name: /RESTORE LAST GOOD \(10:31\)/ }))
        expect(hashes(doc())).toEqual(marked)
    })
})

// The ledger as a person's earlier sync left it: every scene agreed at `bases`.
function seeded(bases) {
    const storage = memoryStorage()
    writeBases(PROJECT, bases, { storage, now: new Date('2026-09-30T09:58:00') })
    return storage
}

describe('sync from a file: the three-way marks and the three actions', () => {
    // Base: the show as both copies last agreed it. Here: Red room changed. There: Roof reveal changed.
    // Both: White cathedral changed differently on each side.
    const base = MIN
    const cath = named(MIN, 'White cathedral')
    const roof = named(MIN, 'Roof reveal')
    const here = withCue(withCue(base, LIT.id, { fade: 1 }), cath.id, { fade: 1 })
    const there = withCue(withCue(base, roof.id, { fade: 2 }), cath.id, { fade: 2 })

    it('reading a file shows the four marks, counts them in words, and changes nothing', async () => {
        const storage = seeded(hashes(base))
        const { log } = mount(here, { storage })
        expect(screen.getByText(OFFLINE_SENTENCE)).toBeTruthy()
        expect(screen.getByText(/last synced \d\d:\d\d/)).toBeTruthy()
        await readFile(bundleText(there))
        expect(log).toHaveLength(0)
        expect(within(strip()).getByText(`${scenesOf(base).length - 3} same, 1 changed here (waiting to send), 1 changed there (as last seen), 1 changed on both`)).toBeTruthy()
        expect(within(rowOf('Red room')).getByText('CHANGED HERE')).toBeTruthy()
        expect(within(rowOf('Roof reveal')).getByText('CHANGED THERE')).toBeTruthy()
        expect(within(rowOf('White cathedral')).getByText('CHANGED ON BOTH')).toBeTruthy()
        // the tiles carry the marks too
        const tile = screen.getAllByRole('button').find((b) => b.classList.contains('rigscenes-tile') && b.textContent.includes('Columns from below'))
        expect(within(tile).getByText('SAME')).toBeTruthy()
        // a changed-here row offers keep mine only; changed-there take theirs (and keep mine); both all three
        expect(within(rowOf('Red room')).queryByRole('button', { name: 'TAKE THEIRS' })).toBeNull()
        expect(within(rowOf('White cathedral')).getAllByRole('button').map((b) => b.textContent)).toEqual(['TAKE THEIRS', 'KEEP MINE', 'KEEP BOTH'])
    })
    it('take theirs: a restore point FIRST, then their scene; restore last good undoes it; the ledger moves', async () => {
        const storage = seeded(hashes(base))
        const { log, doc } = mount(here, { storage, now: () => new Date('2026-09-30T11:00:00') })
        await readFile(bundleText(there))
        fireEvent.click(within(rowOf('Roof reveal')).getByRole('button', { name: 'TAKE THEIRS' }))
        expect(log).toHaveLength(1)
        expect(sceneHash(named(doc(), 'Roof reveal'))).toBe(sceneHash(named(there, 'Roof reveal')))
        expect(status()).toMatch(/^Took "Roof reveal" from there\. A restore point was kept first/)
        expect(readLedger(PROJECT, storage).lastSync[roof.id]).toBe(sceneHash(named(there, 'Roof reveal')))
        expect(rowOf('Roof reveal')).toBeUndefined() // now the same on both: no longer listed
        expect(within(strip()).getByText(`${scenesOf(base).length - 2} same, 1 changed here (waiting to send), 0 changed there (as last seen), 1 changed on both`)).toBeTruthy()
        // the restore point is the copy from BEFORE the take, not the one opened and not the one after
        const restore = screen.getByRole('button', { name: /RESTORE LAST GOOD/ })
        expect(restore.textContent).toContain('file read 11:00')
        fireEvent.click(restore)
        expect(hashes(doc())).toEqual(hashes(here))
    })
    it('take theirs on a scene changed on both takes the restore point too', async () => {
        const { doc } = mount(here, { storage: seeded(hashes(base)) })
        await readFile(bundleText(there))
        fireEvent.click(within(rowOf('White cathedral')).getByRole('button', { name: 'TAKE THEIRS' }))
        expect(named(doc(), 'White cathedral').fade).toBe(2)
        fireEvent.click(screen.getByRole('button', { name: /RESTORE LAST GOOD \(file read/ }))
        expect(named(doc(), 'White cathedral').fade).toBe(1)
    })
    it('keep mine: nothing is written here', async () => {
        const storage = seeded(hashes(base))
        const { log } = mount(here, { storage })
        await readFile(bundleText(there))
        fireEvent.click(within(rowOf('White cathedral')).getByRole('button', { name: 'KEEP MINE' }))
        expect(log).toHaveLength(0)
        expect(within(rowOf('White cathedral')).getByText('kept mine')).toBeTruthy()
        expect(status()).toMatch(/^Kept mine for "White cathedral"\. Nothing here changed/)
    })
    it('keep both: mine stays, theirs becomes a labelled copy outside the loop; the loop keeps its length', async () => {
        const { log, doc } = mount(here, { storage: seeded(hashes(base)), now: () => new Date('2026-09-30T11:05:00') })
        await readFile(bundleText(there))
        fireEvent.click(within(rowOf('White cathedral')).getByRole('button', { name: 'KEEP BOTH' }))
        expect(log).toHaveLength(1)
        expect(named(doc(), 'White cathedral').fade).toBe(1)
        const copy = scenesOf(doc()).find((s) => s.name === 'White cathedral (there 11:05)')
        expect(copy).toBeTruthy()
        expect(copy.inLoop).toBe(false)
        expect(readScenes(doc()).loopSeconds).toBe(readScenes(here).loopSeconds)
        expect(screen.getByRole('button', { name: /RESTORE LAST GOOD \(file read 11:05\)/ })).toBeTruthy()
    })
    it('read only: the file is compared, but no action can write', async () => {
        const { log } = mount(here, { storage: seeded(hashes(base)), readOnly: true })
        await readFile(bundleText(there))
        const take = within(rowOf('Roof reveal')).getByRole('button', { name: 'TAKE THEIRS' })
        expect(take.disabled).toBe(true)
        fireEvent.click(take)
        expect(log).toHaveLength(0)
        for (const b of screen.getAllByRole('button').filter((x) => /UNDO|RESTORE|MARK/.test(x.textContent))) expect(b.disabled).toBe(true)
    })
})

describe('the carried file', () => {
    it('EXPORT writes a di.scenes/1 bundle that parses back, hashes intact, with the ledger\'s bases', async () => {
        const download = vi.fn()
        const storage = seeded(hashes(MIN))
        mount(MIN, { storage, download })
        fireEvent.click(screen.getByRole('button', { name: 'EXPORT' }))
        expect(download).toHaveBeenCalledTimes(1)
        const [name, text] = download.mock.calls[0]
        expect(name).toBe(`${PROJECT}.scenes.json`)
        const b = parseBundle(text)
        expect(b.project).toBe(PROJECT)
        expect(Object.fromEntries(b.scenes.map((s) => [s.id, s.hash]))).toEqual(hashes(MIN))
        expect(b.lastSync).toEqual(hashes(MIN))
        // read back into the same copy: every scene is the same
        await readFile(text)
        expect(within(strip()).getByText(`${scenesOf(MIN).length} same, 0 changed here (waiting to send), 0 changed there (as last seen), 0 changed on both`)).toBeTruthy()
    })
    it('garbage is refused in words and nothing is compared or written', async () => {
        const { log } = mount()
        await readFile('this is not json', 'x.json')
        expect(within(strip()).getByText(/^Not read: this file is not JSON\. Nothing was changed\.$/)).toBeTruthy()
        const tampered = JSON.parse(bundleText(MIN))
        tampered.scenes[0].scene.name = 'Changed after'
        await readFile(JSON.stringify(tampered), 'y.json')
        expect(within(strip()).getByText(/does not match its hash/)).toBeTruthy()
        await readFile(JSON.stringify({ ...JSON.parse(bundleText(MIN)), project: 'another-show' }), 'z.json')
        expect(within(strip()).getByText(/holds the scenes of "another-show"/)).toBeTruthy()
        expect(within(strip()).queryByRole('list')).toBeNull()
        expect(log).toHaveLength(0)
    })
})

describe('B: the loop as a timeline, read only', () => {
    it('one cue per loop scene, the loop length, the guard in words; tapping a cue edits its look', () => {
        const { log, doc } = mount()
        fireEvent.click(screen.getByRole('tab', { name: 'B · CUE TIMELINE' }))
        const tl = screen.getByRole('group', { name: 'The loop, 79 s' })
        const cues = within(tl).getAllByRole('button')
        expect(cues).toHaveLength(8)
        expect(screen.getByText(/Read only: retime is not a control yet\. A change of hold could take the loop outside 60-90 s \(it is 79 s now\)/)).toBeTruthy()
        expect(screen.queryByRole('slider', { name: /boundary/i })).toBeNull()
        fireEvent.click(within(tl).getByRole('button', { name: /^6 Red room, 12 s/ }))
        fireEvent.click(screen.getByLabelText('Red room colour #ff00aa'))
        expect(log).toHaveLength(1)
        expect(doc().mappingState.cues.map((c) => c.hold)).toEqual(MIN.mappingState.cues.map((c) => c.hold))
    })
    it('a loop already outside 60-90 s is said, not hidden', () => {
        mount(withCue(MIN, LIT.id, { hold: 40 }))
        fireEvent.click(screen.getByRole('tab', { name: 'B · CUE TIMELINE' }))
        expect(screen.getByRole('alert').textContent).toBe('! The loop is 107 s, outside 60-90 s.')
    })
})

describe('rectangles, 44 px, and the keyboard', () => {
    beforeAll(() => {
        const style = document.createElement('style')
        style.textContent = fs.readFileSync(path.join(ROOT, 'src/rigbuild/scenes.css'), 'utf8')
        document.head.appendChild(style)
    })
    const px = (v) => Number.parseFloat(v || '0')
    const interactive = (root) => [...root.querySelectorAll('button, input, select, textarea, a[href], [tabindex]')].filter((el) => !(el.type === 'file' && el.hidden))

    it('every control is at least 44 px and has corners of 2 px or less, on both tabs, with a file read', async () => {
        const { container } = mount(MIN, { storage: seeded(hashes(MIN)) })
        await readFile(bundleText(withCue(MIN, LIT.id, { fade: 2 })))
        for (const tab of ['A · SCENE DECK', 'B · CUE TIMELINE']) {
            fireEvent.click(screen.getByRole('tab', { name: tab }))
            const els = interactive(container)
            expect(els.length).toBeGreaterThan(20)
            for (const el of els) {
                const cs = getComputedStyle(el)
                const where = `${el.tagName} "${el.textContent || el.getAttribute('aria-label')}"`
                expect(px(cs.minHeight), where).toBeGreaterThanOrEqual(44)
                expect(px(cs.minWidth), where).toBeGreaterThanOrEqual(44)
                expect(px(cs.borderRadius), where).toBeLessThanOrEqual(2)
            }
        }
    })
    it('every control is reachable by keyboard; the tabs move with the arrow keys', () => {
        const { container } = mount()
        const els = interactive(container)
        const tabs = screen.getAllByRole('tab')
        for (const el of els) {
            if (tabs.includes(el) && el.getAttribute('aria-selected') !== 'true') continue // roving tab stop
            expect(el.tabIndex, `${el.tagName} ${el.textContent}`).toBeGreaterThanOrEqual(0)
        }
        tabs[0].focus()
        fireEvent.keyDown(tabs[0], { key: 'ArrowRight' })
        expect(screen.getByRole('tab', { name: 'B · CUE TIMELINE' }).getAttribute('aria-selected')).toBe('true')
        expect(document.activeElement).toBe(screen.getByRole('tab', { name: 'B · CUE TIMELINE' }))
        expect(screen.getByRole('tabpanel').getAttribute('aria-labelledby')).toBe('rigscenes-tab-B')
    })
})

describe('the preview, the ledger, the address', () => {
    it('the strobe preview never passes 3 flashes a second, and is off with reduced motion', () => {
        const count = (options) => {
            let flashes = 0
            let was = false
            for (let t = 0; t < 1000; t += 1) {
                const on = previewFlashOn(HIT.flags.strobe ? HIT : { ...HIT, flags: { strobe: true } }, t, options)
                if (on && !was) flashes += 1
                was = on
            }
            return flashes
        }
        expect(MAX_PREVIEW_FLASHES_PER_S).toBe(3)
        expect(count()).toBeLessThanOrEqual(3)
        expect(count()).toBeGreaterThan(0)
        expect(count({ reducedMotion: true })).toBe(0)
        expect(previewFlashOn({ flags: { strobe: false } }, 0)).toBe(false)
    })
    it('play follows the holds; with loop off it holds the last scene', () => {
        const scenes = scenesOf(MIN)
        const { cues, total } = timelineOf(scenes)
        expect(total).toBe(79)
        expect(playingAt(scenes, 0)).toBe(cues[0].id)
        expect(playingAt(scenes, 10_500)).toBe(cues[1].id)
        expect(playingAt(scenes, 79_000 + 500)).toBe(cues[0].id)
        expect(playingAt(scenes, 79_000 + 500, { loop: false })).toBe(cues[cues.length - 1].id)
    })
    it('the ledger: per project, hashes only, broken or blocked storage reads as empty', () => {
        const storage = memoryStorage()
        const h = 'a'.repeat(64)
        const { ok } = writeBases(PROJECT, { one: h, bad: 'nope' }, { storage, now: new Date('2026-09-30T10:31:00Z') })
        expect(ok).toBe(true)
        expect(readLedger(PROJECT, storage)).toEqual({ lastSync: { one: h }, at: '2026-09-30T10:31:00.000Z' })
        expect(readLedger('another', storage).lastSync).toEqual({})
        storage.setItem(ledgerKey(PROJECT), '{broken')
        expect(readLedger(PROJECT, storage).lastSync).toEqual({})
        const blocked = { getItem: () => { throw new Error('blocked') }, setItem: () => { throw new Error('blocked') } }
        expect(readLedger(PROJECT, blocked).lastSync).toEqual({})
        expect(writeBases(PROJECT, { one: h }, { storage: blocked }).ok).toBe(false)
    })
    it('/{space}/scenes/{project} is the page, and the steps row carries it', () => {
        expect(buildScenesPath('moxir', 'moxir-hall')).toBe('/moxir/scenes/moxir-hall')
        expect(getScenesLocationState({ pathname: '/moxir/scenes/moxir-hall' })).toEqual({ isScenes: true, spaceId: 'moxir', projectId: 'moxir-hall' })
        expect(getScenesLocationState({ pathname: '/moxir/scenes' }).isScenes).toBe(false)
        const row = rigRow({ spaceId: 'moxir', projectId: 'moxir-hall', here: 'scenes' })
        expect(row.find((s) => s.key === 'scenes')).toMatchObject({ href: '/moxir/scenes/moxir-hall', here: true })
    })
})

describe('no people on these screens', () => {
    it('no names, roles, accounts, audit lines or proposals', async () => {
        const { container } = mount(MIN, { storage: seeded(hashes(MIN)) })
        await readFile(bundleText(withCue(MIN, LIT.id, { fade: 2 })))
        const words = container.textContent.toLowerCase()
        for (const w of ['organizer', 'account', 'user', 'role', 'proposal', 'propose', 'approved by', 'signed in', 'audit', 'changed by']) expect(words).not.toContain(w)
        await waitFor(() => expect(words).toContain('changed there'))
    })
})

// --- the review fixes (A4 1-3, 5, 6; 2026-09-30): each of these failed on the code before ---
describe('review A4-1: undo and restore last good refuse when the show changed elsewhere', () => {
    const colleagueCue = (doc) => applyProjectOps(doc, [{ type: 'createMappingCue', payload: { cue: { id: 'cue-colleague', name: 'Colleague', fade: 0, hold: 5, lightLook: doc.mappingState.cues[0].lightLook } } }])
    it('RESTORE LAST GOOD writes nothing over a colleague\'s cue and says why', () => {
        const { log, doc } = mount()
        act(() => { Harness.set((d) => colleagueCue(d)) })
        fireEvent.click(screen.getByRole('button', { name: /RESTORE LAST GOOD/ }))
        expect(log).toHaveLength(0)
        expect(status()).toMatch(/^Not done: .*changed elsewhere/)
        expect(doc().mappingState.cues.some((c) => c.id === 'cue-colleague')).toBe(true)
    })
    it('UNDO writes nothing over a colleague\'s later colour on another look and says why', () => {
        const { log, doc } = mount()
        pick('Red room')
        fireEvent.click(screen.getByLabelText('Red room colour #00ff66'))
        const other = scenesOf(doc()).find((s) => s.id !== LIT.id && s.lookId !== LIT.lookId && Object.values(s.levels).some((v) => v > 0))
        act(() => { Harness.set((d) => withLook(d, other.lookId, (l) => ({ ...l, colours: { ...l.colours, [Object.keys(other.levels)[0]]: '#123456' } }))) })
        const before = hashes(doc())
        fireEvent.click(screen.getByRole('button', { name: 'UNDO' }))
        expect(log).toHaveLength(1)
        expect(hashes(doc())).toEqual(before)
        expect(status()).toMatch(/^Not done: .*changed elsewhere/)
    })
})

describe('review A4-3: one restore point per file read, not per take', () => {
    it('two takes, then RESTORE LAST GOOD goes back before the first', async () => {
        const base = MIN
        const cath = named(MIN, 'White cathedral')
        const roof = named(MIN, 'Roof reveal')
        const here = withCue(base, LIT.id, { fade: 1 })
        const there = withCue(withCue(base, roof.id, { fade: 2 }), cath.id, { fade: 2 })
        const { doc } = mount(here, { storage: seeded(hashes(base)) })
        await readFile(bundleText(there))
        fireEvent.click(within(rowOf('Roof reveal')).getByRole('button', { name: 'TAKE THEIRS' }))
        fireEvent.click(within(rowOf('White cathedral')).getByRole('button', { name: 'TAKE THEIRS' }))
        expect(named(doc(), 'Roof reveal').fade).toBe(2)
        fireEvent.click(screen.getByRole('button', { name: /RESTORE LAST GOOD/ }))
        expect(hashes(doc())).toEqual(hashes(here))
    })
})

describe('review A4-2: the ledger does not say synced before the store has taken the write', () => {
    it('bases are held while the store has not moved, shown with its error, and written once it has', async () => {
        const base = MIN
        const roof = named(MIN, 'Roof reveal')
        const there = withCue(base, roof.id, { fade: 2 })
        const storage = seeded(hashes(base))
        const { log, rerender } = mount(base, { storage, syncVersion: 5 })
        await readFile(bundleText(there))
        fireEvent.click(within(rowOf('Roof reveal')).getByRole('button', { name: 'TAKE THEIRS' }))
        expect(log).toHaveLength(1)
        expect(readLedger(PROJECT, storage).lastSync[roof.id]).toBe(sceneHash(roof)) // not theirs yet
        const again = (extra) => rerender(<Harness start={base} log={log} storage={storage} projectId={PROJECT} reducedMotion syncVersion={5} {...extra} />)
        again({ syncError: 'Session expired — sign in again to keep syncing.' })
        expect(screen.getByRole('alert').textContent).toMatch(/Not saved to the server yet: Session expired/)
        expect(readLedger(PROJECT, storage).lastSync[roof.id]).toBe(sceneHash(roof))
        again({ syncError: null, syncVersion: 6 })
        expect(readLedger(PROJECT, storage).lastSync[roof.id]).toBe(sceneHash(named(there, 'Roof reveal')))
        expect(screen.queryByRole('alert')).toBeNull()
    })
})

describe('review A4-5 / A4-6: the timeline scrolls; a file of no named show is not compared', () => {
    it('the cue timeline scrolls sideways instead of spilling past its border', () => {
        const css = fs.readFileSync(path.join(ROOT, 'src/rigbuild/scenes.css'), 'utf8')
        expect(css).toMatch(/\.rigscenes-tl \{[^}]*overflow-x: auto/)
    })
    it('a bundle with project "" is refused like one from another show', async () => {
        const { log } = mount(MIN, { storage: seeded(hashes(MIN)) })
        await readFile(JSON.stringify(exportBundle(MIN, { project: '', exportedAt: '2026-09-30T10:00:00.000Z', lastSync: {} })))
        expect(log).toHaveLength(0)
        expect(within(strip()).getByText(/^Not read: this file holds the scenes of no named show/)).toBeTruthy()
    })
})
