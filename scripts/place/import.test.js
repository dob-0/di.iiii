import { describe, it, expect } from 'vitest'
import { hallOps, sourceWall, arrivalShot } from './import.mjs'

const place = {
    bakedIn: true,
    transform: { position: [-6.4, -10, -2.7], rotation: [0.18, -0.13, -0.38], scale: [2.6, 2.6, 2.6] },
    size: [8.3, 3.36, 6.3],
    spawn: { x: 0.2, z: -1.4, yaw: -0.14, pitch: 0, altY: 1.6 },
    walkableAreas: [{ minX: -3.5, maxX: 3.5, minZ: -2.5, maxZ: 2.5 }],
    scaleSource: 'measured'
}
const asset = { id: 'abc123', name: 'place.glb', mimeType: 'model/gltf-binary', size: 10, url: '/serverXR/api/x' }

const opOf = (ops, type) => ops.find((op) => op.type === type)

describe('hallOps', () => {
    it('hangs ONE model entity and nothing else', () => {
        const creates = hallOps({ asset, place, title: 'the hall' }).filter((op) => op.type === 'createEntity')
        expect(creates).toHaveLength(1)
        expect(creates[0].payload.entity.type).toBe('model')
        expect(creates[0].payload.entity.components.media.assetId).toBe('abc123')
    })

    it('pins the model STATIC — without this the whole building spins', () => {
        const entity = opOf(hallOps({ asset, place, title: 'the hall' }), 'createEntity').payload.entity
        expect(entity.components.animation.mode).toBe('static')
    })

    it('leaves the entity at the origin when the fit is baked into the file', () => {
        const entity = opOf(hallOps({ asset, place, title: 'the hall' }), 'createEntity').payload.entity
        expect(entity.components.transform.position).toEqual([0, 0, 0])
        expect(entity.components.transform.rotation).toEqual([0, 0, 0])
        expect(entity.components.transform.scale).toEqual([1, 1, 1])
    })

    it('falls back to carrying the fit on the entity when it is not baked in', () => {
        const entity = opOf(hallOps({ asset, place: { ...place, bakedIn: false }, title: 'x' }), 'createEntity').payload.entity
        expect(entity.components.transform.position).toEqual(place.transform.position)
        expect(entity.components.transform.scale).toEqual(place.transform.scale)
    })

    it('carries the spawn, the walkable floor and a dark room', () => {
        const world = opOf(hallOps({ asset, place, title: 'the hall' }), 'setWorldState').payload.patch
        expect(world.spawn).toEqual(place.spawn)
        expect(world.walkableAreas).toEqual(place.walkableAreas)
        expect(world.gridVisible).toBe(false)
        expect(world.fog.enabled).toBe(true)
        expect(world.fog.far).toBeGreaterThan(world.fog.near)
    })

    it('arrives in the room, not in a code page', () => {
        const presentation = opOf(hallOps({ asset, place, title: 'the hall' }), 'setPresentationState').payload.patch
        expect(presentation.entryView).toBe('scene')
    })

    it('registers the model as an asset of the document, or nothing can find it', () => {
        expect(opOf(hallOps({ asset, place, title: 'x' }), 'upsertAsset').payload.asset.id).toBe('abc123')
    })
})

describe('sourceWall', () => {
    const assets = Array.from({ length: 10 }, (_, index) => ({
        id: `a${index}`,
        name: `shot-${index}.jpg`,
        mimeType: index === 3 ? 'video/quicktime' : 'image/jpeg'
    }))

    it('makes one entity per file, image or video by its type', () => {
        const wall = sourceWall(assets)
        expect(wall).toHaveLength(10)
        expect(wall[3].type).toBe('video')
        expect(wall[0].type).toBe('image')
    })

    it('hangs them in rows, centred, at eye height and up', () => {
        const wall = sourceWall(assets, { perRow: 5 })
        const xs = wall.map((entity) => entity.components.transform.position[0])
        expect(Math.min(...xs)).toBeCloseTo(-Math.max(...xs), 6)
        const rowHeights = new Set(wall.map((entity) => entity.components.transform.position[1]))
        expect(rowHeights.size).toBe(2)
        expect(Math.min(...rowHeights)).toBe(1.6)
    })

    it('pins every one of them still', () => {
        expect(sourceWall(assets).every((entity) => entity.components.animation.mode === 'static')).toBe(true)
    })

    it('never autoplays a wall of videos at a visitor', () => {
        expect(sourceWall(assets)[3].components.media.autoplay).toBe(false)
    })
})

describe('arrivalShot', () => {
    it('opens from where the visitor stands, at eye height, looking in', () => {
        const shot = arrivalShot(place)
        expect(shot.position).toEqual([place.spawn.x, place.spawn.altY, place.spawn.z])
        expect(shot.target).toEqual([0, place.spawn.altY, 0])
        expect(shot.far).toBeGreaterThan(place.size[0])
    })

    it('still gives a shot for a room with no spawn authored', () => {
        const shot = arrivalShot({ size: [8, 3, 6] })
        expect(shot.position[1]).toBe(1.6)
        expect(Number.isFinite(shot.far)).toBe(true)
    })
})
