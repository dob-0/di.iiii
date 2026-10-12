import { describe, expect, it } from 'vitest'
import { AmbientLight, DirectionalLight, Group, HemisphereLight, Mesh, PointLight, Scene, SpotLight, Texture } from 'three'
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

describe('beamsOf reads the beam-only lasers that lampsOf cannot see', () => {
    it('returns one entry per laser line with position, direction and drawn flux', async () => {
        const { beamsOf } = await import('./MeasurementMode.jsx')
        const { laserLineGeometry, createLaserLineMaterial } = await import('../../../objectComponents/laserLineMaterial.js')
        const scene = new Scene()
        const lines = [
            { dir: [0, 0, 1], flux: [0.5, 0, 0] },
            { dir: [1, 0, 0], flux: [0, 0.25, 0] }
        ]
        const mesh = new Mesh(laserLineGeometry(lines, 10), createLaserLineMaterial())
        mesh.name = 'cube'
        mesh.position.set(1, 2, 3)
        mesh.rotation.y = Math.PI / 2
        scene.add(mesh)
        const b = beamsOf(scene, 0.5)
        expect(b).toHaveLength(2)
        expect(b[0].mesh_position).toEqual([1, 2, 3])
        expect(b[0].direction[0]).toBeCloseTo(1, 5)
        expect(b[0].direction[2]).toBeCloseTo(0, 5)
        expect(b[0].flux_scene).toEqual([0.5, 0, 0])
        expect(b[0].flux).toEqual([1, 0, 0])
        expect(b[1].drawn).toBe(true)
        expect(b[0].name).toBe('cube')
    })
    const make = async (lines, len = 10) => {
        const { laserLineGeometry, createLaserLineMaterial } = await import('../../../objectComponents/laserLineMaterial.js')
        return new Mesh(laserLineGeometry(lines, len), createLaserLineMaterial())
    }
    const L = [{ dir: [0, 0, 1], flux: [0.5, 0, 0] }, { dir: [1, 0, 0], flux: [0, 0.25, 0] }]

    it('a: vertices per line come from the geometry; a mismatch is one error entry, no NaN lines', async () => {
        const { beamsOf } = await import('./MeasurementMode.jsx')
        const { laserLineGeometry } = await import('../../../objectComponents/laserLineMaterial.js')
        expect(laserLineGeometry(L, 10, 10).userData.vertsPerLine).toBe(22)
        const scene = new Scene()
        const m = await make(L)
        m.name = 'bad'
        m.geometry.userData = {}
        scene.add(m)
        const b = beamsOf(scene, 1)
        expect(b).toHaveLength(1)
        expect(b[0].error).toMatch(/vertsPerLine/)
        expect(b[0].name).toBe('bad')
        const m2 = await make(L)
        m2.geometry.userData.vertsPerLine = 100 // 196 is not a multiple
        const s2 = new Scene()
        s2.add(m2)
        const b2 = beamsOf(s2, 1)
        expect(b2).toHaveLength(1)
        expect(b2[0].error).toBeTruthy()
    })

    it('b: each line has world start and end from its centreline (aDir x aS, first and last station)', async () => {
        const { beamsOf } = await import('./MeasurementMode.jsx')
        const scene = new Scene()
        const m = await make(L, 10)
        m.position.set(1, 2, 3)
        m.rotation.y = Math.PI / 2
        scene.add(m)
        const b = beamsOf(scene, 1)
        ;[1, 2, 3].forEach((x, k) => expect(b[0].start[k]).toBeCloseTo(x, 4))
        expect(b[0].end[0]).toBeCloseTo(11, 4) // local +z, rotated 90 deg about y, length 10
        expect(b[0].end[1]).toBeCloseTo(2, 4)
        expect(b[0].end[2]).toBeCloseTo(3, 4)
        expect(b[0].mesh_position).toEqual([1, 2, 3])
        expect(b[0].position).toBeUndefined()
    })

    it('c: drawn needs every ancestor visible; visible_effective says so', async () => {
        const { beamsOf } = await import('./MeasurementMode.jsx')
        const scene = new Scene()
        const parent = new Group()
        const m = await make(L)
        parent.add(m)
        scene.add(parent)
        parent.visible = false
        const b = beamsOf(scene, 1)
        expect(b[0].visible).toBe(true)
        expect(b[0].visible_effective).toBe(false)
        expect(b[0].drawn).toBe(false)
    })

    it('d: a material without uDiv does not throw; divergence_rad is null', async () => {
        const { beamsOf } = await import('./MeasurementMode.jsx')
        const scene = new Scene()
        const m = await make(L)
        delete m.material.uniforms.uDiv
        scene.add(m)
        const b = beamsOf(scene, 1)
        expect(b[0].divergence_rad).toBeNull()
        expect(b[0].diameter_m).toBeTypeOf('number')
    })
})
