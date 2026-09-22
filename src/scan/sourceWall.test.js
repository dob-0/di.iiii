import { describe, expect, it } from 'vitest'
import {
    MEASURED_WALL_ENTITY_ID,
    measuredWallEntity,
    measuredWallLabel,
    readMeasuredWallLabel,
    sourceWall,
    sourceWallEntity,
    sourceWallSlot,
    SOURCE_WALL_DEFAULTS
} from './sourceWall.js'

const asset = (id, mimeType = 'image/jpeg') => ({ id, name: `${id}.jpg`, mimeType })

describe('sourceWall — the batch importer\'s shape', () => {
    // The wall was built by scripts/place/import.mjs before a phone could hang
    // anything on it. Its geometry must not have moved when the code did.
    it('hangs a wall of twelve centred, left to right and top to bottom', () => {
        const wall = sourceWall([...Array(12)].map((_, index) => asset(`a${index}`)))
        expect(wall).toHaveLength(12)
        // Eight per row, so twelve is two rows and the first is the TOP one.
        expect(wall[0].components.transform.position[1]).toBeGreaterThan(
            wall[8].components.transform.position[1]
        )
        // Centred: the first and last of a full row are mirror images in x.
        expect(wall[0].components.transform.position[0])
            .toBeCloseTo(-wall[7].components.transform.position[0], 6)
    })

    // Left flat they are invisible from standing height — a room with a horizon
    // and nothing in it.
    it('stands every picture up', () => {
        const wall = sourceWall([asset('a')])
        expect(wall[0].components.transform.rotation).toEqual([Math.PI / 2, 0, 0])
    })

    // Without this the whole wall bobs gently in the air.
    it('says static on every picture', () => {
        const wall = sourceWall([asset('a'), asset('b', 'video/webm')])
        wall.forEach((entity) => expect(entity.components.animation.mode).toBe('static'))
    })

    it('knows a clip from a photograph', () => {
        const wall = sourceWall([asset('a', 'image/jpeg'), asset('b', 'video/webm')])
        expect(wall[0].type).toBe('image')
        expect(wall[1].type).toBe('video')
        expect(wall[1].components.media).toMatchObject({ autoplay: false, loop: true, muted: true })
        // A photograph has no playback fields to carry.
        expect(wall[0].components.media.autoplay).toBeUndefined()
    })

    it('carries the asset id and nothing invented', () => {
        const wall = sourceWall([asset('sha-1')])
        expect(wall[0].components.media.assetId).toBe('sha-1')
        expect(Object.keys(wall[0])).toEqual(['id', 'type', 'name', 'components'])
    })
})

describe('sourceWallSlot — the phone\'s growing wall', () => {
    // THE property a live capture needs: a person watching the wall fill while
    // they walk must not see the pictures they already took slide sideways every
    // time they take another one.
    it('never moves a picture already hung', () => {
        const first = sourceWallSlot(0)
        const stillFirst = sourceWallSlot(0)
        expect(stillFirst.position).toEqual(first.position)
        // …and it is the same after the wall has grown past a row.
        expect(sourceWallSlot(0).position).toEqual(first.position)
        expect(sourceWallSlot(3).position).not.toEqual(first.position)
    })

    it('grows rightwards then upwards', () => {
        const [a, b, ninth] = [sourceWallSlot(0), sourceWallSlot(1), sourceWallSlot(8)]
        expect(b.position[0]).toBeGreaterThan(a.position[0])
        expect(b.position[1]).toBe(a.position[1])
        // Nine is the start of the second row: back to the left, one step up.
        expect(ninth.position[0]).toBeCloseTo(a.position[0], 6)
        expect(ninth.position[1]).toBeGreaterThan(a.position[1])
    })

    it('starts the bottom row at eye height, in front of the arrival point', () => {
        const slot = sourceWallSlot(0)
        expect(slot.position[1]).toBe(SOURCE_WALL_DEFAULTS.baseHeight)
        expect(slot.position[2]).toBe(-SOURCE_WALL_DEFAULTS.distance)
    })

    // The batch importer knows its total and centres on it; the phone does not
    // and centres on a full row. Both are the same function.
    it('centres on the pictures it has when the total is known', () => {
        expect(sourceWallSlot(0, { total: 2 }).position[0])
            .toBeGreaterThan(sourceWallSlot(0).position[0])
        expect(sourceWallSlot(0, { total: 8 }).position[0])
            .toBeCloseTo(sourceWallSlot(0).position[0], 6)
    })

    it('scales a picture relative to the plane\'s own built-in height of 3', () => {
        const slot = sourceWallSlot(0)
        expect(slot.scale).toEqual([
            SOURCE_WALL_DEFAULTS.tile / 3,
            SOURCE_WALL_DEFAULTS.tile / 3,
            SOURCE_WALL_DEFAULTS.tile / 3
        ])
    })
})

describe('sourceWallEntity', () => {
    it('lets the caller name the object, so a phone\'s captures keep their own ids', () => {
        expect(sourceWallEntity(asset('a'), 0).id).toBe('source-1')
        expect(sourceWallEntity(asset('a'), 0, { id: 'scan-1' }).id).toBe('scan-1')
    })

    it('falls back to a name rather than leaving one blank', () => {
        expect(sourceWallEntity({ id: 'a' }, 4).name).toBe('source 5')
    })

    // The name is the only place a capture's own story can live — an object keeps
    // no field the schema does not already know about.
    it('lets the caller name the picture', () => {
        expect(sourceWallEntity(asset('a'), 0, { name: 'walk 1 · 30 s' }).name).toBe('walk 1 · 30 s')
    })
})

describe('the measured wall', () => {
    // A tape gives centimetres, and the number is the single most valuable thing
    // a walk produces — docs/architecture/PLACE.md's guess/measured rule.
    it('writes the number a person typed, to the centimetre', () => {
        expect(measuredWallLabel(8.3)).toBe('wall · 8.30 m')
        expect(measuredWallLabel(24)).toBe('wall · 24.00 m')
        // A typed string is a number too — the field hands over text.
        expect(measuredWallLabel('8.3')).toBe('wall · 8.30 m')
        // And the rounding is whatever the double actually holds, not what the
        // decimal looks like: 8.305 is stored as 8.30499…, so it goes down.
        expect(measuredWallLabel('8.305')).toBe('wall · 8.30 m')
        expect(measuredWallLabel('8.306')).toBe('wall · 8.31 m')
    })

    it('says nothing rather than writing a size nobody gave', () => {
        expect(measuredWallLabel(0)).toBe('')
        expect(measuredWallLabel(-3)).toBe('')
        expect(measuredWallLabel(null)).toBe('')
        expect(measuredWallLabel('eight')).toBe('')
        expect(measuredWallEntity(0)).toBeNull()
    })

    // The build reads the metres back out of the label, so the round trip is the
    // contract between the phone and the pipeline.
    it('reads back what it wrote', () => {
        expect(readMeasuredWallLabel(measuredWallLabel(8.3))).toBe(8.3)
        expect(readMeasuredWallLabel(measuredWallLabel(24))).toBe(24)
    })

    it('reads nothing out of a label that says nothing', () => {
        expect(readMeasuredWallLabel('')).toBeNull()
        expect(readMeasuredWallLabel('wall')).toBeNull()
        expect(readMeasuredWallLabel(null)).toBeNull()
        expect(readMeasuredWallLabel('wall · 0.00 m')).toBeNull()
    })

    // One id, so measuring twice replaces the label instead of hanging a second
    // number beside the first.
    it('always carries the same id, so re-measuring replaces it', () => {
        expect(measuredWallEntity(8.3).id).toBe(MEASURED_WALL_ENTITY_ID)
        expect(measuredWallEntity(9).id).toBe(MEASURED_WALL_ENTITY_ID)
    })

    it('stands at the left-hand end of the wall, facing the visitor', () => {
        const entity = measuredWallEntity(8.3)
        expect(entity.type).toBe('text')
        expect(entity.components.text.value).toBe('wall · 8.30 m')
        expect(entity.components.text.billboard).toBe(true)
        expect(entity.components.transform.position[0]).toBeLessThan(sourceWallSlot(0).position[0])
        expect(entity.components.transform.position[1]).toBe(SOURCE_WALL_DEFAULTS.baseHeight)
    })
})
