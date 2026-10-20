import { describe, expect, it } from 'vitest'
import { BoxGeometry, Mesh, MeshStandardMaterial, PerspectiveCamera, Plane, Scene, SpotLight, Vector3 } from 'three'

import { clipGroups, installShaderWarmup, shaderSignature } from './shaderWarmup.js'

const room = () => {
    const scene = new Scene()
    const wall = new Mesh(new BoxGeometry(), new MeshStandardMaterial())
    const floor = new Mesh(new BoxGeometry(), new MeshStandardMaterial())
    const lamp = new SpotLight()
    scene.add(wall, floor, lamp)
    return { scene, wall, floor, lamp }
}

// Just enough of a WebGLRenderer: compile() hands back the materials and gives
// each a program that is ready when the test says so.
const fakeRenderer = () => {
    const props = new WeakMap()
    const r = {
        ready: false,
        drawn: [],
        compiled: [],
        autoClear: true,
        localClippingEnabled: false,
        info: { programs: [] },
        properties: { get: (m) => { if (!props.has(m)) props.set(m, {}); return props.get(m) } },
        render(scene) { r.drawn.push(scene) },
        compile(list) {
            const out = new Set()
            list.traverse((o) => {
                const m = o.material; if (!m) return; out.add(m)
                const program = { released: false, isReady: () => (program.released ? null : r.ready) }
                r.properties.get(m).currentProgram = program
                r.info.programs.push(program)
            })
            r.compiled.push(out.size)
            return out
        }
    }
    return r
}

describe('shaders compiled off the clock', () => {
    it('signs the scene by its materials and lights, not by where things are', () => {
        const { scene, wall, lamp } = room()
        const before = shaderSignature(scene)
        wall.position.set(3, 0, 0)
        expect(shaderSignature(scene)).toBe(before)
        lamp.castShadow = true
        expect(shaderSignature(scene)).not.toBe(before)
        const shadowed = shaderSignature(scene)
        wall.material.needsUpdate = true
        expect(shaderSignature(scene)).not.toBe(shadowed)
    })

    it('groups clipped materials apart, so each is compiled with its own clip count', () => {
        const { scene, wall } = room()
        wall.material.clippingPlanes = [new Plane(new Vector3(0, 1, 0), 0), new Plane(new Vector3(1, 0, 0), 0)]
        expect([...clipGroups(scene, false).keys()]).toEqual([''])
        const groups = clipGroups(scene, true)
        expect([...groups.keys()].sort()).toEqual(['', '2:0'])
        expect(groups.get('2:0').objects).toEqual([wall])
    })

    it('holds the last frame while new programs compile, then draws, and compiles again only when the scene changes', () => {
        const { scene, floor } = room()
        const camera = new PerspectiveCamera()
        const r = fakeRenderer()
        const undo = installShaderWarmup(r)

        r.render(scene, camera)
        r.render(scene, camera)
        expect(r.drawn.filter((s) => s === scene)).toHaveLength(0)

        r.ready = true
        r.render(scene, camera)
        r.render(scene, camera)
        expect(r.drawn.filter((s) => s === scene)).toHaveLength(2)
        const compiles = r.shaderWarmupStats.compiles

        floor.material = new MeshStandardMaterial({ color: 'red' })
        r.ready = false
        r.render(scene, camera)
        expect(r.shaderWarmupStats.compiles).toBe(compiles + 1)
        expect(r.drawn.filter((s) => s === scene)).toHaveLength(2)

        undo()
        r.render(scene, camera)
        expect(r.drawn.filter((s) => s === scene)).toHaveLength(3)
    })

    // three 0.185: a program released while waited on (its material disposed — a look
    // unmounting lamps) answers getProgramParameter with null, and isReady() keeps that
    // null forever; waiting for `true` held the last frame for good (#745 review).
    it('stops waiting for a program three has released, instead of holding the frame forever', () => {
        const { scene } = room()
        const camera = new PerspectiveCamera()
        const r = fakeRenderer()
        installShaderWarmup(r)
        r.render(scene, camera)
        expect(r.drawn.filter((s) => s === scene)).toHaveLength(0)
        for (const program of r.info.programs) program.released = true
        r.info.programs.length = 0
        r.render(scene, camera)
        expect(r.drawn.filter((s) => s === scene)).toHaveLength(1)
    })

    it('never holds the frame longer than the cap: past it, it draws and the rest compile at first draw', () => {
        const { scene } = room()
        const camera = new PerspectiveCamera()
        const r = fakeRenderer()
        let t = 0
        installShaderWarmup(r, { now: () => t, holdMaxMs: 8000 })
        r.render(scene, camera)
        t = 7999
        r.render(scene, camera)
        expect(r.drawn.filter((s) => s === scene)).toHaveLength(0)
        t = 8001
        r.render(scene, camera)
        expect(r.drawn.filter((s) => s === scene)).toHaveLength(1)
        expect(r.shaderWarmupStats.timeouts).toBe(1)
    })
})
