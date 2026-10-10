import { describe, expect, it } from 'vitest'
import { AmbientLight, DirectionalLight, HemisphereLight, PointLight, Scene, SpotLight, Texture } from 'three'
import { RIG_BOUNCE_NAME, holdViewingAids, isViewingAid, releaseViewingAids } from './measureLights.js'

const makeScene = () => {
    const scene = new Scene()
    const work = new AmbientLight('#a39c92', 0.1)
    const sun = new DirectionalLight('#ffffff', 0.4)
    const sky = new HemisphereLight('#ffffff', '#000000', 0.3)
    const bounce = new AmbientLight('#ff0000', 0.02)
    bounce.name = RIG_BOUNCE_NAME
    const lamp = new SpotLight('#ffffff', 610)
    const par = new PointLight('#ffffff', 20)
    scene.add(work, sun, sky, bounce, lamp, par)
    scene.environment = new Texture()
    return { scene, work, sun, sky, bounce, lamp, par }
}

describe('viewing aids are held at zero while measuring', () => {
    it('knows a fixture from a viewing aid', () => {
        const r = makeScene()
        expect(isViewingAid(r.work)).toBe(true)
        expect(isViewingAid(r.sun)).toBe(true)
        expect(isViewingAid(r.sky)).toBe(true)
        expect(isViewingAid(r.lamp)).toBe(false)
        expect(isViewingAid(r.par)).toBe(false)
        expect(isViewingAid(r.bounce)).toBe(true)
        expect(isViewingAid(r.bounce, { keepBounce: true })).toBe(false)
    })
    it('switches off the work light, the other aids and the environment; keeps the lamps', () => {
        const r = makeScene()
        const env = r.scene.environment
        const saved = new Map()
        const held = holdViewingAids(r.scene, saved)
        expect([r.work, r.sun, r.sky, r.bounce].map((l) => l.intensity)).toEqual([0, 0, 0, 0])
        expect(r.lamp.intensity).toBe(610)
        expect(r.par.intensity).toBe(20)
        expect(r.scene.environment).toBeNull()
        expect(held.find((h) => h.kind === 'ambient' && h.colour === '#a39c92').intensity).toBe(0.1)
        expect(held.some((h) => h.kind === 'environment map')).toBe(true)
        releaseViewingAids(r.scene, saved)
        expect([r.work.intensity, r.sun.intensity, r.sky.intensity, r.bounce.intensity]).toEqual([0.1, 0.4, 0.3, 0.02])
        expect(r.scene.environment).toBe(env)
    })
    it('keeps the rig bounce when asked (&bounce=1)', () => {
        const r = makeScene()
        holdViewingAids(r.scene, new Map(), { keepBounce: true })
        expect(r.bounce.intensity).toBe(0.02)
        expect(r.work.intensity).toBe(0)
    })
    it('a value written while it holds (a React prop update) is what comes back', () => {
        const r = makeScene()
        const saved = new Map()
        holdViewingAids(r.scene, saved)
        r.work.intensity = 0.25 // the scene re-rendered with a new work light
        holdViewingAids(r.scene, saved) // the next frame holds it again
        expect(r.work.intensity).toBe(0)
        releaseViewingAids(r.scene, saved)
        expect(r.work.intensity).toBe(0.25)
    })
})
