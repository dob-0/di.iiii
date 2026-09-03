import { describe, it, expect } from 'vitest'
import { animationSeed, authoredAnimation, resolveAnimation, applyAnimation } from './entityAnimation.js'

const entity = (over = {}) => ({ id: 'e', type: 'box', name: '', ...over })

describe('resolveAnimation', () => {
    it('lets an authored mode win over every convention', () => {
        const resolved = resolveAnimation(entity({
            parentId: 'tv-1',
            components: { animation: { mode: 'spin', speed: 2, amplitude: 3 } }
        }))
        expect(resolved).toEqual({ mode: 'spin', speed: 2, amplitude: 3 })
    })

    it('falls back to float for a standalone object and sway for flat media', () => {
        expect(resolveAnimation(entity()).mode).toBe('float')
        expect(resolveAnimation(entity({ type: 'video' })).mode).toBe('sway')
    })

    it('keeps name conventions for standalone objects', () => {
        expect(resolveAnimation(entity({ name: 'Cinema floor' })).mode).toBe('static')
        expect(resolveAnimation(entity({ name: 'fly rig' })).mode).toBe('orbit')
    })

    // Regression guard: the idle fallback is seeded per entity, so applying it
    // inside a group tore composed objects apart in the live/walk viewer -- the
    // 360 Cinema's cabinets spun at 0.12 rad/s while their video plane swayed
    // the other way, leaving the picture hanging outside the TV. The editor's
    // viewport never applied the fallback, so the scene looked correct there and
    // broken only once you walked into it.
    it('leaves parented entities alone so a group moves as one object', () => {
        expect(resolveAnimation(entity({ parentId: 'tv-1' })).mode).toBe('static')
        expect(resolveAnimation(entity({ type: 'video', parentId: 'tv-1' })).mode).toBe('static')
    })
})

describe('applyAnimation', () => {
    const group = () => ({
        position: { set(x, y, z) { Object.assign(this, { x, y, z }) } },
        rotation: { set(x, y, z) { Object.assign(this, { x, y, z }) } }
    })

    it('static holds the authored pose exactly', () => {
        const g = group()
        applyAnimation(g, { mode: 'static' }, [1, 2, 3], [0.1, 0.2, 0.3], 12.5)
        expect([g.position.x, g.position.y, g.position.z]).toEqual([1, 2, 3])
        expect([g.rotation.x, g.rotation.y, g.rotation.z]).toEqual([0.1, 0.2, 0.3])
    })

    it('float keeps turning as time advances', () => {
        const a = group()
        const b = group()
        applyAnimation(a, { mode: 'float' }, [0, 0, 0], [0, 0, 0], 1)
        applyAnimation(b, { mode: 'float' }, [0, 0, 0], [0, 0, 0], 5)
        expect(b.rotation.y).toBeGreaterThan(a.rotation.y)
    })
})

// The arrival view and walk mode animate the same room one click apart. They
// each used to compute the phase offset themselves; the seed is shared so the
// click does not restart every object's motion from zero.
describe('animationSeed', () => {
    it('is deterministic and stays inside one full phase', () => {
        expect(animationSeed('entity-42')).toBe(animationSeed('entity-42'))
        const seed = animationSeed('entity-42')
        expect(seed).toBeGreaterThanOrEqual(0)
        expect(seed).toBeLessThan(Math.PI * 2)
    })

    it('separates two entities so their idle motion is not synchronised', () => {
        expect(animationSeed('alpha')).not.toBe(animationSeed('beta'))
    })

    it('survives a missing id instead of throwing', () => {
        expect(animationSeed(undefined)).toBe(0)
    })
})

// The arrival frame (StudioViewport in orbit) and walk mode deliberately do NOT
// agree here, and this is the one asymmetry in the pair. Walk keeps the
// imported-scene fallback that floats models and sways flat media; arrival must
// show only motion an author asked for, or the first frame a stranger judges
// the platform by would set every live room drifting unbidden.
describe('authoredAnimation — the arrival frame never reaches the fallback', () => {
    it('returns nothing for an entity with no animation component', () => {
        const plain = entity()
        expect(authoredAnimation(plain)).toBeNull()
        // ...while walk mode still drifts it, which is the whole point.
        expect(resolveAnimation(plain).mode).toBe('float')
    })

    it('returns nothing for the fallback modes the name/type conventions invent', () => {
        for (const over of [{ type: 'video' }, { type: 'image' }, { name: 'fly rig' }, { name: 'Cinema floor' }]) {
            expect(authoredAnimation(entity(over)), JSON.stringify(over)).toBeNull()
        }
    })

    it('returns nothing for an explicit static, which is an author asking for stillness', () => {
        expect(authoredAnimation(entity({ components: { animation: { mode: 'static' } } }))).toBeNull()
    })

    it('returns the authored mode, speed and amplitude when one was chosen', () => {
        expect(authoredAnimation(entity({
            components: { animation: { mode: 'spin', speed: 8, amplitude: 2 } }
        }))).toEqual({ mode: 'spin', speed: 8, amplitude: 2 })
    })

    it('defaults speed and amplitude for a bare authored mode', () => {
        expect(authoredAnimation(entity({ components: { animation: { mode: 'bob' } } })))
            .toEqual({ mode: 'bob', speed: 1, amplitude: 1 })
    })
})
