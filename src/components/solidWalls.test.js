import { describe, it, expect, vi } from 'vitest'
import {
    BoxGeometry, BufferAttribute, BufferGeometry, CylinderGeometry, Group, InstancedMesh, Mesh, MeshBasicMaterial,
    MeshStandardMaterial, PlaneGeometry, Scene
} from 'three'
import {
    SOLID_WALLS_RADIUS, buildSolidWalls, collectSolidMeshes, createSolidWallsKeeper, isSolidMesh, mergeWorldTriangles,
    slideCapsule, walkStep
} from './solidWalls.js'
import { confineToAreas } from './walkableAreas.js'

const R = SOLID_WALLS_RADIUS
const TOL = 0.011 // the push-out settles within SETTLE (1 cm)

const solid = () => new MeshStandardMaterial()
const boxAt = (w, h, d, x, y, z, material = solid()) => {
    const mesh = new Mesh(new BoxGeometry(w, h, d), material)
    mesh.position.set(x, y, z)
    mesh.updateMatrixWorld(true)
    return mesh
}
const trunkAt = (radius, x, z, height = 4) => {
    const mesh = new Mesh(new CylinderGeometry(radius, radius, height, 16), solid())
    mesh.position.set(x, height / 2, z)
    mesh.updateMatrixWorld(true)
    return mesh
}
const buildOrThrow = (meshes, options) => {
    const { collider, text } = buildSolidWalls(meshes, options)
    if (!collider) throw new Error(text)
    return collider
}
// walk as the Walker does: many small frames at a velocity (metres per second)
const walk = (collider, from, velocity, frames, dt = 1 / 60) => {
    let { x, z } = from
    let last = null
    for (let i = 0; i < frames; i += 1) {
        last = slideCapsule(collider, x, z, x + velocity.x * dt, z + velocity.z * dt)
        x = last.x
        z = last.z
    }
    return { x, z, last }
}

// the north wall: x from -5 to 5, z from -0.1 to 0.1, 3 m high; the walker stays on the +z side
const northWall = () => boxAt(10, 3, 0.2, 0, 1.5, 0)

describe('slideCapsule -- head-on wall', () => {
    it('stops a radius in front of the wall and does not drift sideways', () => {
        const collider = buildOrThrow([northWall()])
        const end = walk(collider, { x: 0, z: 3 }, { x: 0, z: -5.2 }, 120) // 2 s at full walking speed, 10 m of intent
        expect(end.z).toBeGreaterThanOrEqual(0.1 + R - TOL)
        expect(end.z).toBeLessThan(0.1 + R + 0.05)
        expect(Math.abs(end.x)).toBeLessThan(1e-6)
        expect(end.last.blocked).toBe(true)
    })

    it('does not let a hard push in one frame through', () => {
        const collider = buildOrThrow([northWall()])
        const end = slideCapsule(collider, 0, 1, 0, -5) // one 6 m frame
        expect(end.z).toBeGreaterThanOrEqual(0.1 + R - TOL)
    })
})

describe('slideCapsule -- glancing wall', () => {
    it('keeps the whole sideways part of the move and removes only the part into the wall', () => {
        const collider = buildOrThrow([northWall()])
        // from (-4, 1) at (2, -1) m/s for 2 s: the straight line would end at (0, -1), behind the wall
        const end = walk(collider, { x: -4, z: 1 }, { x: 2, z: -1 }, 120)
        expect(end.x).toBeCloseTo(0, 1) // 4 m of sideways travel, all of it kept: that is the slide
        expect(end.z).toBeGreaterThanOrEqual(0.1 + R - TOL)
        expect(end.z).toBeLessThan(0.1 + R + 0.05)
    })
})

describe('slideCapsule -- corner', () => {
    // walls z = 0 (north) and x = 5 (east): the room is x < 4.9, z > 0.1
    const corner = () => [northWall(), boxAt(0.2, 3, 10, 5, 1.5, 5)]

    it('ends clear of both walls, holds still when pushed on, and walks out again at full speed', () => {
        const collider = buildOrThrow(corner())
        let end = walk(collider, { x: 2, z: 3 }, { x: 3, z: -3 }, 240) // diagonally into the corner for 4 s
        expect(end.x).toBeLessThanOrEqual(4.9 - R + TOL)
        expect(end.z).toBeGreaterThanOrEqual(0.1 + R - TOL)
        expect(end.x).toBeGreaterThan(4.9 - R - 0.05) // it did get all the way in
        expect(end.z).toBeLessThan(0.1 + R + 0.05)

        const held = walk(collider, end, { x: 3, z: -3 }, 120) // keep pushing for 2 s more: no creep
        expect(Math.hypot(held.x - end.x, held.z - end.z)).toBeLessThan(0.02)

        const out = walk(collider, held, { x: -3, z: 3 }, 30) // 0.5 s away from the corner: 2.12 m of intent
        const moved = Math.hypot(out.x - held.x, out.z - held.z)
        expect(moved).toBeGreaterThan(0.95 * Math.hypot(1.5, 1.5)) // not stuck
    })

    it('slides along either wall of the corner when pushed along it', () => {
        const collider = buildOrThrow(corner())
        const east = walk(collider, { x: 4.5, z: 3 }, { x: 3, z: -2 }, 60) // into the east wall and on toward the north wall
        expect(east.x).toBeLessThanOrEqual(4.9 - R + TOL)
        expect(east.z).toBeLessThan(3 - 1.2) // it travelled along the wall (toward -z) rather than stopping
    })
})

describe('slideCapsule -- thin trunk', () => {
    it('cannot be jumped over in one long frame (a 10 cm post, a 4 m frame)', () => {
        const collider = buildOrThrow([boxAt(0.1, 4, 0.1, 0, 2, 0)])
        const end = slideCapsule(collider, 0, 2, 0, -2)
        expect(end.z).toBeGreaterThanOrEqual(0.05 + R - TOL)
        expect(end.z).toBeLessThan(0.05 + R + 0.06)
        expect(Math.abs(end.x)).toBeLessThan(1e-6)
    })

    it('is never entered: a round trunk, pushed on from four sides, keeps its distance in every frame', () => {
        const collider = buildOrThrow([trunkAt(0.1, 0, 0)])
        const apothem = 0.1 * Math.cos(Math.PI / 16) // the 16-sided trunk's nearest face
        for (const [x, z, vx, vz] of [[0, 2, 0, -2], [0.12, 2, 0, -2], [-2, 0.03, 2, 0], [1.5, 1.5, -2, -2]]) {
            let px = x
            let pz = z
            let nearest = Infinity
            for (let i = 0; i < 240; i += 1) {
                const step = slideCapsule(collider, px, pz, px + vx / 60, pz + vz / 60)
                px = step.x
                pz = step.z
                nearest = Math.min(nearest, Math.hypot(px, pz))
            }
            expect(nearest).toBeGreaterThanOrEqual(apothem + R - 2 * TOL)
        }
    })

    it('is walked around: a push slightly off centre slides past the trunk', () => {
        const collider = buildOrThrow([trunkAt(0.1, 0, 0)])
        const end = walk(collider, { x: 0.12, z: 2 }, { x: 0, z: -2 }, 180) // 3 s, 6 m of intent, 12 cm off the axis
        expect(end.z).toBeLessThan(-1) // it is round and past the trunk
        expect(end.last.blocked).toBe(false)
    })

    it('gets a walker that starts inside a thin trunk out of it', () => {
        const collider = buildOrThrow([trunkAt(0.1, 0, 0)])
        const end = walk(collider, { x: 0.02, z: 0.02 }, { x: 0, z: 2 }, 60)
        expect(Math.hypot(end.x, end.z)).toBeGreaterThanOrEqual(0.1 * Math.cos(Math.PI / 16) + R - 2 * TOL)
    })
})

describe('slideCapsule -- what is not a wall', () => {
    it('lets a walker cross floors, a ceiling, a kerb and a beam over the head at full speed', () => {
        const ground = boxAt(40, 0.2, 40, 0, -0.1, 0) // top at y = 0
        const sheet = new Mesh(new PlaneGeometry(40, 40), solid()) // zero-thickness floor at y = 0
        sheet.rotation.x = -Math.PI / 2
        sheet.updateMatrixWorld(true)
        const ceiling = boxAt(40, 0.2, 40, 0, 3.1, 0)
        const kerb = boxAt(10, 0.25, 0.4, 0, 0.125, -2) // under the step height
        const beam = boxAt(10, 0.2, 0.5, 0, 2.0, 0) // above the head (the capsule ends at 1.7 m)
        const collider = buildOrThrow([ground, sheet, ceiling, kerb, beam])
        const end = walk(collider, { x: 0, z: 6 }, { x: 0, z: -5.2 }, 120) // 10.4 m of intent, through all of them
        expect(end.z).toBeCloseTo(6 - 10.4, 2)
        expect(end.last.blocked).toBe(false)
    })

    it('does stop at a half-metre wall, the foot-sphere resting on its top edge', () => {
        const low = boxAt(10, 0.5, 0.4, 0, 0.25, -4) // front face at z = -3.8
        const collider = buildOrThrow([low])
        const end = walk(collider, { x: 0, z: 0 }, { x: 0, z: -5.2 }, 120)
        // the foot-sphere's centre is 0.6 m up, 0.1 m over the top edge: it stops where the 3-D distance is the radius
        const expected = -3.8 + Math.sqrt(R * R - 0.1 * 0.1)
        expect(end.z).toBeGreaterThanOrEqual(expected - TOL)
        expect(end.z).toBeLessThan(expected + 0.05)
    })

    it('cuts a 50 m hitch to what can be checked, never a tunnel', () => {
        const collider = buildOrThrow([boxAt(10, 3, 0.2, 0, 1.5, -10)])
        const end = slideCapsule(collider, 0, 0, 0, -50)
        expect(end.z).toBeGreaterThan(-10 + 0.1 + R - 0.5) // not through the wall at -10
        expect(end.z).toBeLessThan(-7) // and it did move
    })
})

describe('walkStep -- the part is off unless there are walls', () => {
    const areas = [{ minX: -2, maxX: 2, minZ: -2, maxZ: 6 }]
    const moves = [[0, 0, 1, 1], [0, 0, 3, 0], [1.9, 5.9, 2.5, 6.4], [0, 0, 0, 0], [5, 5, 0, 0], [-1, 1, -1, -3]]

    it('is confineToAreas, exactly, with no walls', () => {
        for (const [fx, fz, tx, tz] of moves) {
            expect(walkStep(areas, null, fx, fz, tx, tz)).toEqual(confineToAreas(areas, fx, fz, tx, tz))
            expect(walkStep(null, null, fx, fz, tx, tz)).toEqual({ x: tx, z: tz })
        }
    })

    it('with walls, still never leaves a declared floor rectangle', () => {
        const collider = buildOrThrow([boxAt(0.2, 3, 4, 1.9, 1.5, 3)]) // a wall right at the east edge of the area
        const end = walkStep(areas, collider, 1.0, 3, 3.0, 3)
        expect(end.x).toBeLessThanOrEqual(2)
        expect(end.x).toBeLessThanOrEqual(1.8 - R + TOL)
    })
})

describe('which meshes are walls', () => {
    it('leaves out air: hidden, no-solid subtrees, haze, wireframes, instanced meshes', () => {
        const scene = new Scene()
        const wall = boxAt(2, 2, 0.2, 0, 1, 0)
        const hidden = boxAt(2, 2, 0.2, 5, 1, 0)
        hidden.visible = false
        const hiddenParent = new Group()
        hiddenParent.visible = false
        hiddenParent.add(boxAt(2, 2, 0.2, 7, 1, 0))
        const noSolid = new Group()
        noSolid.userData.noSolid = true
        noSolid.add(boxAt(2, 2, 0.2, 9, 1, 0))
        const haze = boxAt(2, 2, 0.2, 11, 1, 0, new MeshBasicMaterial({ transparent: true, depthWrite: false }))
        const wire = boxAt(2, 2, 0.2, 13, 1, 0, new MeshBasicMaterial({ wireframe: true }))
        const ghost = boxAt(2, 2, 0.2, 15, 1, 0, new MeshBasicMaterial({ transparent: true, opacity: 0 }))
        const instanced = new InstancedMesh(new BoxGeometry(1, 1, 1), solid(), 3)
        const glass = boxAt(2, 2, 0.2, 17, 1, 0, new MeshStandardMaterial({ transparent: true, opacity: 0.3 })) // glass IS a wall
        scene.add(wall, hidden, hiddenParent, noSolid, haze, wire, ghost, instanced, glass)
        const found = collectSolidMeshes(scene)
        expect(found).toContain(wall)
        expect(found).toContain(glass)
        expect(found).toHaveLength(2)
        expect(isSolidMesh(haze)).toBe(false)
        expect(isSolidMesh(null)).toBe(false)
    })
})

describe('building the walls', () => {
    it('says why and builds nothing over the triangle limit', () => {
        const meshes = [boxAt(1, 1, 1, 0, 0, 0), boxAt(1, 1, 1, 3, 0, 0)] // 24 triangles
        const merged = mergeWorldTriangles(meshes, { maxTriangles: 20 })
        expect(merged.tooMany).toBe(true)
        expect(merged.triangles).toBe(24)
        const built = buildSolidWalls(meshes, { maxTriangles: 20 })
        expect(built.collider).toBe(null)
        expect(built.text).toMatch(/^off: 24 triangles is over the limit of 20/)
    })

    it('skips a broken mesh whole and keeps the rest working', () => {
        const broken = new Mesh(new BufferGeometry(), solid())
        broken.geometry.setAttribute('position', new BufferAttribute(new Float32Array([0, 0, 0, 1, 0, 0, NaN, 1, 0]), 3))
        const good = northWall()
        const built = buildSolidWalls([broken, good])
        expect(built.text).toMatch(/1 broken mesh skipped/)
        const end = walk(built.collider, { x: 0, z: 3 }, { x: 0, z: -5.2 }, 120)
        expect(end.z).toBeGreaterThanOrEqual(0.1 + R - TOL)
    })

    it('says so when the scene has no solid mesh yet', () => {
        const built = buildSolidWalls([])
        expect(built.collider).toBe(null)
        expect(built.text).toMatch(/^on: no solid meshes yet/)
    })

    it('bakes the mesh transform into the walls (a rotated and scaled wall)', () => {
        const wall = new Mesh(new BoxGeometry(1, 1, 1), solid())
        wall.scale.set(10, 3, 0.2)
        wall.rotation.y = Math.PI / 2 // now along z
        wall.position.set(4, 1.5, 0)
        wall.updateMatrixWorld(true)
        const collider = buildOrThrow([wall])
        const end = walk(collider, { x: 0, z: 0 }, { x: 5.2, z: 0 }, 120)
        expect(end.x).toBeLessThanOrEqual(4 - 0.1 - R + TOL)
        expect(end.x).toBeGreaterThan(4 - 0.1 - R - 0.05)
    })
})

describe('createSolidWallsKeeper', () => {
    it('builds on the first look, follows a change once it has settled, and drops a mesh that keeps moving', () => {
        const scene = new Scene()
        scene.add(northWall())
        let t = 0
        const said = []
        const keeper = createSolidWallsKeeper({ root: scene, clock: () => t, onStatus: (text) => said.push(text) })

        const first = keeper.tick()
        expect(first).not.toBe(null)
        expect(said[0]).toMatch(/^on: 1 solid meshes/)
        t = 100
        expect(keeper.tick()).toBe(first) // not looked at again within the interval

        scene.add(trunkAt(0.1, 3, 3)) // something finishes loading
        t = 600
        expect(keeper.tick()).toBe(first) // seen, not yet settled
        t = 1200
        expect(keeper.tick()).toBe(first) // settled, but a rebuild is not allowed so soon after the last
        t = 2600
        const second = keeper.tick()
        expect(second).not.toBe(first)
        expect(second.meshes).toBe(2)

        // a mesh that moves on three looks in a row is not a wall
        const mover = boxAt(1, 1, 1, 0, 0.5, 8)
        scene.add(mover)
        for (let i = 0; i < 8; i += 1) { t += 2600; mover.position.x += 1; keeper.tick() }
        expect(keeper.collider.meshes).toBe(2)
        expect(said[said.length - 1]).toMatch(/1 left out because they keep moving/)
        keeper.dispose()
        expect(keeper.collider).toBe(null)
    })

    it('says why, on the console and in the status, when the scene is over the limit', () => {
        const scene = new Scene()
        scene.add(northWall())
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
        const said = []
        const keeper = createSolidWallsKeeper({ root: scene, maxTriangles: 5, clock: () => 0, onStatus: (text) => said.push(text) })
        expect(keeper.tick()).toBe(null)
        expect(said[0]).toMatch(/^off: 12 triangles is over the limit of 5/)
        expect(warn).toHaveBeenCalledTimes(1)
        warn.mockRestore()
    })
})
