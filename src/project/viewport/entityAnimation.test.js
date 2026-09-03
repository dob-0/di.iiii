import { describe, it, expect } from 'vitest'
import { resolveAnimation, applyAnimation } from './entityAnimation.js'

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

    // Regression guard: text is often authored standing up (e.g. rotation.x =
    // PI/2 to face +z, as on the jam surface). 'float' used to be the fallback
    // for anything that wasn't image/video, which set rotation.y = baseRot[1]
    // + spin every frame -- a fresh Euler set on top of a non-zero base X, not
    // a rotation around the plane's own facing. That tumbled the text through
    // off-axis orientations that read as rotated ~90° from the camera (letters
    // vertical instead of horizontal) on the jam surface's walk-mode viewer,
    // while the published page's default orbit view (no idle motion at all)
    // stayed correct -- so the same document looked broken only in walk mode.
    it('keeps text still (bob only, never spin) regardless of billboard', () => {
        expect(resolveAnimation(entity({ type: 'text' })).mode).toBe('bob')
        expect(resolveAnimation(entity({ type: 'text', components: { text: { billboard: true } } })).mode).toBe('bob')
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

    it('bob never rotates a standing (non-zero base X) plane as time advances', () => {
        const baseRot = [Math.PI / 2, 0, 0]
        const g = group()
        applyAnimation(g, { mode: 'bob' }, [0, 0, 0], baseRot, 42)
        expect([g.rotation.x, g.rotation.y, g.rotation.z]).toEqual(baseRot)
    })
})
