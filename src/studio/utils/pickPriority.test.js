import fs from 'node:fs'
import path from 'node:path'
import { cwd } from 'node:process'
import { describe, expect, it, vi } from 'vitest'
import { entityInfoOf, handlePickClick, pickFromHits, pickUserData } from './pickPriority.js'

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
