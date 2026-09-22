import { describe, expect, it } from 'vitest'
import {
    buildReadiness,
    ENOUGH_STILLS,
    ENOUGH_WALK_SECONDS,
    scanProgress,
    sourcesProjectId,
    stillName,
    walkPieceName
} from './scanSources.js'
import { MEASURED_WALL_ENTITY_ID, measuredWallEntity } from './sourceWall.js'

const walk = (n, seconds) => ({ id: `scan-${n}`, type: 'video', name: walkPieceName(n, seconds) })
const still = (n) => ({ id: `scan-${n}`, type: 'image', name: stillName(n) })

describe('sourcesProjectId', () => {
    // The same name scripts/place/import.mjs uses, so a batch import and a phone
    // fill one room rather than two.
    it('is the space with -sources after it', () => {
        expect(sourcesProjectId('moxir')).toBe('moxir-sources')
        expect(sourcesProjectId(' moxir ')).toBe('moxir-sources')
    })
})

describe('scanProgress', () => {
    it('finds nothing in an empty room', () => {
        expect(scanProgress({ entities: [] })).toMatchObject({ walkSeconds: 0, pieces: 0, stills: 0, hung: 0 })
        expect(scanProgress(null).measuredMetres).toBeNull()
    })

    // A walk is measured in the seconds its pieces SAY they hold — not in
    // pieces × 30, which would call a four-second tail half a minute.
    it('adds up the seconds the pieces name, tail included', () => {
        const progress = scanProgress({ entities: [walk(1, 30), walk(2, 30), walk(3, 4)] })
        expect(progress.walkSeconds).toBe(64)
        expect(progress.pieces).toBe(3)
        expect(progress.stills).toBe(0)
    })

    it('counts stills apart from walk pieces', () => {
        const progress = scanProgress({ entities: [walk(1, 30), still(2), still(3)] })
        expect(progress).toMatchObject({ walkSeconds: 30, pieces: 1, stills: 2, hung: 3 })
    })

    // A batch import's own wall (`source-N`) is somebody else's work in the same
    // room and must not be counted as this phone's walk.
    it('ignores everything that is not the phone\'s own', () => {
        const progress = scanProgress({
            entities: [
                { id: 'source-1', type: 'image', name: 'frame-00001.jpg' },
                { id: 'place-hall', type: 'model', name: 'the hall' },
                still(1)
            ]
        })
        expect(progress.stills).toBe(1)
        expect(progress.hung).toBe(1)
    })

    // The label is not a picture: the slot the next capture hangs in is one past
    // the last PICTURE, or the label would leave a hole in the wall.
    it('does not count the measured-wall label as a picture', () => {
        const progress = scanProgress({ entities: [still(1), measuredWallEntity(8.3)] })
        expect(progress.hung).toBe(1)
        expect(progress.stills).toBe(1)
        expect(progress.measuredMetres).toBe(8.3)
    })

    it('reads the measured wall back out of the room', () => {
        expect(scanProgress({ entities: [measuredWallEntity(24)] }).measuredMetres).toBe(24)
        expect(scanProgress({ entities: [{ id: MEASURED_WALL_ENTITY_ID, type: 'text', name: 'wall' }] }).measuredMetres).toBeNull()
    })
})

describe('buildReadiness', () => {
    it('is ready on a minute of walking', () => {
        expect(buildReadiness({ walkSeconds: ENOUGH_WALK_SECONDS, stills: 0 }).ready).toBe(true)
        expect(buildReadiness({ walkSeconds: 61, stills: 0 }).missing).toBe('')
    })

    it('is ready on forty photographs instead', () => {
        expect(buildReadiness({ walkSeconds: 0, stills: ENOUGH_STILLS }).ready).toBe(true)
    })

    // Never a bare "not ready": the words have to be something a person standing
    // in a hall can act on.
    it('says what is missing, in the route this walk is closer to finishing', () => {
        expect(buildReadiness({ walkSeconds: 50, stills: 0 }).missing).toBe('10 more seconds of walking')
        expect(buildReadiness({ walkSeconds: 59, stills: 0 }).missing).toBe('1 more second of walking')
        expect(buildReadiness({ walkSeconds: 0, stills: 38 }).missing).toBe('2 more photographs')
    })

    it('names walking for a walk nobody has started', () => {
        expect(buildReadiness({ walkSeconds: 0, stills: 0 }).missing).toBe('60 more seconds of walking')
        expect(buildReadiness(null).missing).toBe('60 more seconds of walking')
    })

    // Seconds are whole: "10.4 more seconds of walking" is a machine talking.
    it('counts in whole seconds', () => {
        expect(buildReadiness({ walkSeconds: 49.6, stills: 0 }).missing).toBe('11 more seconds of walking')
    })
})
