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
        properties: { get: (m) => { if (!props.has(m)) props.set(m, {}); return props.get(m) } },
        render(scene) { r.drawn.push(scene) },
        compile(list) {
            const out = new Set()
            list.traverse((o) => { const m = o.material; if (!m) return; out.add(m); r.properties.get(m).currentProgram = { isReady: () => r.ready } })
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
})
