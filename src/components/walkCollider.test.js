// @vitest-environment node
import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { entityCollides, buildWalkCollider, groundBelow, resolveWalkBody, resolveFlyBody } from './walkCollider.js'
import { createWalkSim, advanceWalkSim } from './walkPhysics.js'
import { EYE_HEIGHT, WALK_BODY_RADIUS } from './walkModeConfig.js'

// A test room, built the way LiveProjectScene builds one: each entity is a
// group tagged with entityCollides(entity), under one root.
function box(w, h, d, x, y, z, material = new THREE.MeshStandardMaterial()) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material)
    m.position.set(x, y, z)
    return m
}
function entity(type, child, extra = {}) {
    const g = new THREE.Group()
    g.userData.walkCollide = entityCollides({ type, components: extra })
    g.add(child)
    return g
}
function room() {
    const root = new THREE.Group()
    root.add(entity('box', box(40, 0.1, 40, 0, -0.05, 0)))              // floor, top at y = 0
    root.add(entity('box', box(20, 4, 0.2, 0, 2, -5)))                  // wall across z = -5
    root.add(entity('box', box(2, 0.2, 2, 6, 0.1, 0)))                  // stair tread, top at 0.2
    root.add(entity('box', box(6, 1.1, 0.1, -6, 0.55, 0)))              // crowd barrier 1.1 m, at z = 0
    root.add(entity('portal', box(2, 3, 0.2, 0, 1.5, 5)))               // a door between rooms
    root.add(entity('spotLight', box(1, 1, 1, 3, 1, 5)))                // a light's body
    const beam = box(1, 3, 1, -3, 1.5, 5, new THREE.MeshBasicMaterial({ blending: THREE.AdditiveBlending, transparent: true, depthWrite: false }))
    root.add(entity('model', beam))                                      // light, not matter, inside a model
    root.add(entity('box', box(1, 1, 1, 10, 0.5, 5), { collision: { enabled: false } }))
    root.add(entity('box', box(40, 0.2, 40, 0, 8.1, 0)))                 // roof, underside at 8
    return root
}
const collider = buildWalkCollider(room())
const solid = {
    ground: (x, z, feetY) => groundBelow(collider, x, z, feetY),
    walk: (x, feetY, z) => resolveWalkBody(collider, x, feetY, z),
    fly: (x, y, z) => resolveFlyBody(collider, x, y, z),
}

// Walk straight along a heading for `seconds` at 60 fps; returns the sim.
function walk({ from, yaw, seconds = 3, fly = false, vert = 0 }) {
    const sim = createWalkSim(from[0], from[1], from[2])
    for (let i = 0; i < seconds * 60; i++) advanceWalkSim(sim, { forward: 1, yaw, fly, vert }, 1 / 60, { solid })
    return sim
}
// yaw 0 walks +z, yaw PI walks -z, yaw PI/2 walks +x, -PI/2 walks -x.

describe('walkCollider: which entities are matter', () => {
    it('portals, lights, text, audio and rings pass; the rest is solid; authors can opt out', () => {
        for (const t of ['portal', 'spotLight', 'pointLight', 'text', 'audio', 'ring']) expect(entityCollides({ type: t })).toBe(false)
        for (const t of ['box', 'model', 'plane', 'image', 'video', 'cylinder']) expect(entityCollides({ type: t })).toBe(true)
        expect(entityCollides({ type: 'box', components: { collision: { enabled: false } } })).toBe(false)
        expect(entityCollides({ type: 'portal', components: { collision: { enabled: true } } })).toBe(true)
    })
})

describe('walkCollider: walking', () => {
    it('a wall stops the body one radius short of its face, without jitter', () => {
        const sim = walk({ from: [0, EYE_HEIGHT, 0], yaw: Math.PI })
        const face = -5 + 0.1
        expect(sim.body.z).toBeGreaterThan(face)
        expect(sim.body.z - face).toBeCloseTo(WALK_BODY_RADIUS, 1)
        expect(Math.hypot(sim.body.vx, sim.body.vz)).toBeLessThan(0.05)   // no speed stored pushing into it
    })

    it('walking into the wall at an angle slides along it', () => {
        const sim = walk({ from: [0, EYE_HEIGHT, -3], yaw: Math.PI * 0.75, seconds: 2 })   // toward -z and +x
        expect(sim.body.x).toBeGreaterThan(2)
        expect(sim.body.z).toBeGreaterThan(-5 + 0.1)
    })

    it('a 1.1 m barrier blocks', () => {
        const sim = walk({ from: [-6, EYE_HEIGHT, 3], yaw: Math.PI })
        expect(sim.body.z).toBeGreaterThan(0.05)
    })

    it('a 20 cm tread is stepped onto and the eye rises with it', () => {
        const sim = walk({ from: [2, EYE_HEIGHT, 0], yaw: Math.PI / 2, seconds: 1.3 })
        expect(sim.body.x).toBeGreaterThan(5.2)                          // on the tread (x 5..7)
        expect(sim.body.y).toBeCloseTo(0.2 + EYE_HEIGHT, 2)
    })

    it('portals, a light body, an additive beam and an opted-out box let the body through', () => {
        expect(walk({ from: [0, EYE_HEIGHT, 2], yaw: 0 }).body.z).toBeGreaterThan(7)     // portal
        expect(walk({ from: [3, EYE_HEIGHT, 2], yaw: 0 }).body.z).toBeGreaterThan(7)     // spotLight
        expect(walk({ from: [-3, EYE_HEIGHT, 2], yaw: 0 }).body.z).toBeGreaterThan(7)    // beam
        expect(walk({ from: [10, EYE_HEIGHT, 2], yaw: 0 }).body.z).toBeGreaterThan(7)    // collision off
    })

    it('with no room at all nothing changes (spaces without matter walk as before)', () => {
        const empty = buildWalkCollider(new THREE.Group())
        expect(empty.bvh).toBeNull()
        expect(resolveWalkBody(empty, 1, 0, 2)).toEqual({ x: 1, z: 2, pushed: false })
        expect(groundBelow(empty, 0, 0, 0)).toBeNull()
    })
})

describe('walkCollider: flying', () => {
    it('the camera cannot fly through a wall', () => {
        const sim = walk({ from: [0, 3, 0], yaw: Math.PI, fly: true })
        expect(sim.body.z).toBeGreaterThan(-5 + 0.1)
    })

    it('the camera cannot rise through the roof', () => {
        const sim = walk({ from: [0, 5, 0], yaw: 0, seconds: 3, fly: true, vert: 1 })
        expect(sim.body.y).toBeLessThan(8)
    })
})
