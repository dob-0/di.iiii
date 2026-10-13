import { describe, expect, it } from 'vitest'
import { entityInfoOf, pickFromHits } from './pickPriority.js'

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
