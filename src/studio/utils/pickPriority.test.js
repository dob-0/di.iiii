import fs from 'node:fs'
import path from 'node:path'
import { cwd } from 'node:process'
import { describe, expect, it, vi } from 'vitest'
import { entityInfoOf, handlePickClick, pickFromHits, pickUserData, unitOfHits } from './pickPriority.js'

// a tiny scene graph: group(entity) → mesh; beams carry beamPick
const group = (id, { body = false, locked = false } = {}) => ({ userData: { svEntityId: id, svPick: body ? 'body' : 'other', svLocked: locked }, parent: null })
const mesh = (parent, userData = {}) => ({ userData, parent })
const hit = (object) => ({ object })

const lampA = group('lamp-a', { body: true })
const lampB = group('lamp-b', { body: true })
const hall = group('place-hall', { locked: true })
const deck = group('rig-deck-1')
const beamA = mesh(lampA, { beamPick: true, noBounds: true })
const bodyB = mesh(lampB)
const hallMesh = mesh(hall)
const deckMesh = mesh(deck)

describe('pickFromHits', () => {
    it('a beam over the locked place picks the beam\'s lamp', () => {
        expect(pickFromHits([hit(beamA), hit(hallMesh)])).toBe('lamp-a')
    })
    it('a lamp body behind a beam wins over the beam', () => {
        expect(pickFromHits([hit(beamA), hit(bodyB), hit(hallMesh)])).toBe('lamp-b')
    })
    it('a beam in front of a deck picks the lamp, not the deck', () => {
        expect(pickFromHits([hit(beamA), hit(deckMesh)])).toBe('lamp-a')
    })
    it('a deck alone is picked as before', () => {
        expect(pickFromHits([hit(deckMesh), hit(hallMesh)])).toBe('rig-deck-1')
    })
    it('the locked place alone is still picked (lock stops moves, not looking); nothing = null', () => {
        expect(pickFromHits([hit(hallMesh)])).toBe('place-hall')
        expect(pickFromHits([])).toBeNull()
    })
    it('a locked lamp\'s beam picks that lamp', () => {
        const lampL = group('lamp-l', { body: true, locked: true })
        expect(pickFromHits([hit(mesh(lampL, { beamPick: true })), hit(hallMesh)])).toBe('lamp-l')
    })
    it('entityInfoOf walks up to the entity group', () => {
        expect(entityInfoOf(beamA)).toEqual({ id: 'lamp-a', body: true, locked: false })
        expect(entityInfoOf({ userData: {}, parent: null })).toBeNull()
    })
})

// Walked 2026-10-13 in headless Chromium: only GROUP entities used the rule. A top-level lamp B clicked through
// lamp A's beam selected A, a click on the locked place kept the selection, an orbit drag ending on a lamp selected it.
describe('handlePickClick — every entity\'s click', () => {
    const click = (hits, extra = {}) => ({ intersections: hits, delta: 0, nativeEvent: {}, stopPropagation: vi.fn(), ...extra })
    const handlers = () => ({ onSelect: vi.fn(), onToggleSelect: vi.fn() })
    it('a lamp body behind another lamp\'s beam is selected', () => {
        const h = handlers()
        handlePickClick(click([hit(beamA), hit(bodyB), hit(hallMesh)]), h)
        expect(h.onSelect).toHaveBeenCalledWith('lamp-b')
    })
    it('the locked place alone is picked (the lock stops moves, not looking)', () => {
        const h = handlers()
        const e = click([hit(hallMesh)])
        handlePickClick(e, h)
        expect(h.onSelect).toHaveBeenCalledWith('place-hall')
        expect(e.stopPropagation).toHaveBeenCalled()
    })
    it('a plain click on the one selected object again deselects it; with two selected it keeps that one', () => {
        const h = handlers()
        handlePickClick(click([hit(bodyB)]), { ...h, selectedIds: new Set(['lamp-b']) })
        expect(h.onSelect).toHaveBeenCalledWith(null)
        const h2 = handlers()
        handlePickClick(click([hit(bodyB)]), { ...h2, selectedIds: new Set(['lamp-a', 'lamp-b']) })
        expect(h2.onSelect).toHaveBeenCalledWith('lamp-b')
    })
    it('Shift adds the picked lamp, not the beam\'s lamp in front', () => {
        const h = handlers()
        handlePickClick(click([hit(beamA), hit(bodyB)], { nativeEvent: { shiftKey: true } }), h)
        expect(h.onToggleSelect).toHaveBeenCalledWith('lamp-b')
        expect(h.onSelect).not.toHaveBeenCalled()
    })
    it('a drag (orbit) that ends on a lamp selects nothing', () => {
        const h = handlers()
        handlePickClick(click([hit(bodyB)], { delta: 30 }), h)
        expect(h.onSelect).not.toHaveBeenCalled()
        expect(h.onToggleSelect).not.toHaveBeenCalled()
    })
    it('pickUserData marks lamps as bodies and carries the lock', () => {
        expect(pickUserData({ id: 'l', components: { light: {}, runtime: { locked: true } } })).toEqual({ svEntityId: 'l', svPick: 'body', svLocked: true, svBuilding: false })
        expect(pickUserData({ id: 'p', components: {} })).toEqual({ svEntityId: 'p', svPick: 'other', svLocked: false, svBuilding: false })
    })
    it('pickUserData tags the building, where a beam stops (beamReach.js)', () => {
        expect(pickUserData({ id: 'place-hall', type: 'model', components: {} }).svBuilding).toBe(true)
        expect(pickUserData({ id: 'x', type: 'model', components: { viewRole: 'architecture' } }).svBuilding).toBe(true)
    })
    it('both entity kinds in StudioViewport carry the flags and the one handler', () => {
        const src = fs.readFileSync(path.join(cwd(), 'src/studio/components/StudioViewport.jsx'), 'utf8')
        expect(src.match(/userData=\{pickUserData\(entity\)\}/g)).toHaveLength(2)
        expect(src.match(/onClick=\{\(e\) => handlePickClick\(e,/g)).toHaveLength(2)
    })
})

// A laser unit is several beam entities (rig-laser-41a, 41b …): Alt+click on any line picks the unit (laserTest.js), so the
// multi-selection gizmo moves the whole unit by hand. A plain click keeps the old rule.
describe('laser unit pick', () => {
    const lineGroup = (id) => ({ userData: { ...pickUserData({ id, components: { light: {}, beam: { laser: { mW: [1, 1, 1] } } } }) }, parent: null })
    const lineA = lineGroup('rig-laser-41a')
    const beamMesh = mesh(lineA, { beamPick: true, noBounds: true })
    const click = (hits, nativeEvent = {}) => ({ intersections: hits, delta: 0, nativeEvent, stopPropagation: vi.fn() })
    it('pickUserData names the unit of a laser line, and only of a laser line', () => {
        expect(pickUserData({ id: 'rig-laser-41b', components: { beam: { laser: { mW: [1] } } } }).svUnit).toBe('rig-laser-41')
        expect('svUnit' in pickUserData({ id: 'l', components: { light: {} } })).toBe(false)
        expect(entityInfoOf(beamMesh)).toMatchObject({ id: 'rig-laser-41a', unit: 'rig-laser-41' })
        expect(unitOfHits([hit(beamMesh)], 'rig-laser-41a')).toBe('rig-laser-41')
        expect(unitOfHits([hit(bodyB)], 'lamp-b')).toBeNull()
    })
    it('Alt+click on a line asks for its whole unit; a plain click still picks the one line', () => {
        const onSelect = vi.fn(); const onToggleSelect = vi.fn(); const onSelectUnit = vi.fn()
        handlePickClick(click([hit(beamMesh)], { altKey: true }), { onSelect, onToggleSelect, onSelectUnit })
        expect(onSelectUnit).toHaveBeenCalledWith('rig-laser-41', { additive: false })
        expect(onSelect).not.toHaveBeenCalled()
        handlePickClick(click([hit(beamMesh)]), { onSelect, onToggleSelect, onSelectUnit })
        expect(onSelect).toHaveBeenCalledWith('rig-laser-41a')
        expect(onSelectUnit).toHaveBeenCalledTimes(1)
    })
    it('Alt+click on something that is no laser line is a plain click', () => {
        const onSelect = vi.fn(); const onSelectUnit = vi.fn()
        handlePickClick(click([hit(bodyB)], { altKey: true }), { onSelect, onToggleSelect: vi.fn(), onSelectUnit })
        expect(onSelect).toHaveBeenCalledWith('lamp-b')
        expect(onSelectUnit).not.toHaveBeenCalled()
    })
})

describe('a lamp body drawn by RigBodies (one InstancedMesh per kind) takes the click from a beam in front of it', () => {
    const beamOf = (id) => ({ object: { userData: { beamPick: true }, parent: { userData: { svEntityId: id, svPick: 'body' } } } })
    const bodies = { userData: { rigBody: true, lampIds: ['head-1', 'head-2', 'head-3'] } }
    const floor = { object: { userData: { svEntityId: 'floor', svPick: 'other' } } }
    it('the instance is its lamp: a wash beam crossing in front no longer wins the moving head behind it', () => {
        expect(pickFromHits([beamOf('wash-key'), { object: bodies, instanceId: 1 }, floor])).toBe('head-2')
    })
    it('an instance with no lamp id is no hit; the beam then picks its lamp, as before', () => {
        expect(pickFromHits([beamOf('wash-key'), { object: bodies, instanceId: 7 }, floor])).toBe('wash-key')
        expect(entityInfoOf(bodies, { instanceId: 0 })).toEqual({ id: 'head-1', body: true, locked: false })
    })
})
