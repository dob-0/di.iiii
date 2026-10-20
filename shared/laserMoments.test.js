// @vitest-environment node
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const { LASER_TYPE_IDS, hasSignOffMarker, isLaserGroupKey, laserMomentOf } = require('./laserMoments.cjs')

const library = JSON.parse(readFileSync(new URL('../src/rigbuild/types/moxir.json', import.meta.url), 'utf8'))

describe('which looks are laser moments', () => {
    it('names every laser in the fixture library — a laser added there and not here fails the build', () => {
        const lasers = library.types.filter((t) => t.category === 'laser').map((t) => t.id).sort()
        expect(lasers.length).toBeGreaterThan(0)
        expect([...LASER_TYPE_IDS].sort()).toEqual(lasers)
    })

    it('a lit LaserCube group is a laser moment (MOXIR v1.0, "one line": laser 6a at 1)', () => {
        const look = { id: 'one-line', title: 'One line', intent: '', aims: {}, colours: {}, levels: { 'named-v1-laser-6a/ext-lc-ultra-mk2': 1, 'named-v1-laser-6b/ext-lc-ultra-mk2': 0, 'x/up-pl5403': 1 } }
        expect(laserMomentOf(look)).toEqual({ reason: 'lit', groups: ['named-v1-laser-6a/ext-lc-ultra-mk2'] })
    })

    it('a laser held at 0 in every group is not one ("the black")', () => {
        const look = { id: 'black', intent: 'Nothing lit; the smoke stays. 3-5 s before every laser moment.', levels: { 'named-v1-laser-1a/ext-lc-ultra-mk2': 0, 'par/up-pl5403': 0 } }
        expect(laserMomentOf(look)).toBe(null)
    })

    it('a group the look names with no level is at full — an aimed laser with no level counts', () => {
        expect(laserMomentOf({ id: 'a', aims: { 'roof/up-la40wf': { rule: 'up' } } })).toEqual({ reason: 'lit', groups: ['roof/up-la40wf'] })
    })

    it('the sign-off marker in the intent counts even with every laser at 0 (ground-scenes.mjs writes it so)', () => {
        const look = { id: 'gs-laser-roof', intent: 'LASER: off by default; requiresLaserSignOff: written at level 0', levels: { 'laser-cut': 0 } }
        expect(laserMomentOf(look)).toEqual({ reason: 'marker', groups: [] })
        expect(hasSignOffMarker('xrequiresLaserSignOffx')).toBe(false)
    })

    it('a group whose name says laser is one, whatever its type says', () => {
        expect(isLaserGroupKey('laser-cut')).toBe(true)
        expect(isLaserGroupKey('named-v1-laser-1a/ext-something-new')).toBe(true)
        expect(isLaserGroupKey('cob-cut-curtain/up-cob200')).toBe(false)
    })
})
