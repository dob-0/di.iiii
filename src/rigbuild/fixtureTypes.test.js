// @vitest-environment node
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { buildLibrary, serialise } from '../../scripts/rigbuild/types.mjs'
import { footprintOf, modeOf, powerOf, typeById, typeFlags, typeIdOf, typesFromManifest } from './fixtureTypes.js'
import { isAssumedMode } from './assumedProfiles.js'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const committed = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/rigbuild/types/moxir.json'), 'utf8'))

describe('the MOXIR type library', () => {
    it('is exactly what the generator makes from the manifest (never edited by hand)', () => {
        const text = fs.readFileSync(path.join(ROOT, 'src/rigbuild/types/moxir.json'), 'utf8')
        expect(serialise(buildLibrary())).toBe(text)
    })

    it('holds the nine rental codes (UP-COB200 since the cut and the halo, 2026-09-29), the three other-supplier planning types, and the owner’s LaserCube', () => {
        expect(committed.types.map((t) => t.code).filter((c) => c.startsWith('UP-')).sort()).toEqual(
            ['UP-250BSW', 'UP-B380F', 'UP-COB200', 'UP-HK1915', 'UP-LA40WF', 'UP-PL5403', 'UP-Q108S', 'UP-YH600F', 'UP-YZ31P'])
        expect(committed.types.map((t) => t.code).filter((c) => !c.startsWith('UP-')).sort()).toEqual(['EXT-BLINDER', 'EXT-HAZER', 'EXT-LC-ULTRA-MK2', 'EXT-STROBE'])
        // The planning types are modelled on an equivalent; the LaserCube (2026-10-04) is the
        // owner's own unit, identified EXACTLY from its maker's page and manual.
        for (const t of committed.types.filter((x) => x.code.startsWith('EXT-'))) {
            expect(t.identified).toBe(t.code === 'EXT-LC-ULTRA-MK2' ? 'EXACT' : 'EQUIVALENT')
        }
        const cube = typeById(committed, 'EXT-LC-ULTRA-MK2')
        expect(cube.modes.map((m) => m.footprint)).toEqual([16])
        expect(cube.modes[0].channels.map((c) => c.role)).toContain('dimmer')
        expect(cube.modes[0].channelsSource.basis).toBe('EXACT')
    })

    it('carries the published footprints and invents none', () => {
        expect(footprintOf(typeById(committed, 'UP-B380F'))).toBe(16)
        // The maker's (or the named equivalent's) published modes, unchanged; the ASSUMED
        // test modes (assumedProfiles.js) sit beside them, each marked, never in their place.
        const real = (t) => t.modes.filter((m) => !isAssumedMode(m))
        expect(real(typeById(committed, 'up-250bsw')).map((m) => m.footprint)).toEqual([24, 30])
        expect(real(typeById(committed, 'up-hk1915')).map((m) => m.footprint)).toEqual([21, 35, 78, 92, 97])
        // UP-PL5403 has ONE published mode, 8ch (uplight.com.cn, 2026-09-29); its list comes from the tested unit.
        expect(real(typeById(committed, 'up-pl5403')).map((m) => [m.name, m.channels.length, m.channelsSource.basis])).toEqual([['8ch', 8, 'TESTED']])
        // UP-LA40WF: the maker publishes no mode; the one it ran in on the tested unit is the only real one.
        const laser = typeById(committed, 'UP-LA40WF')
        expect(real(laser).map((m) => [m.name, m.basis])).toEqual([['32ch', 'TESTED']])
        expect(laser.defaultMode).toBe('32ch')
        const co2 = typeById(committed, 'UP-Q108S')
        expect(co2.modesOwed).toBe(true)
        expect(real(co2)).toEqual([])
        expect(co2.modes.every((m) => m.basis === 'ASSUMED' && /-assumed$/.test(m.name))).toBe(true)
        expect(co2.defaultMode).toBe(null)
    })

    it('attaches a channel list only where a source gives one, and says where from', () => {
        const spark = typeById(committed, 'UP-YH600F')
        expect(spark.modes[0].channels.map((c) => c.role)).toEqual(['Fountain', 'Control'])
        expect(spark.modes[0].channelsSource.basis).toBe('EQUIVALENT')
        expect(spark.modes[0].channelsSource.url).toMatch(/open-fixture-library\/[0-9a-f]{40}\//)
        // A tested unit's list says so, with no url to invent; a mode nobody charted stays null.
        const beam = modeOf(typeById(committed, 'UP-B380F'))
        expect(beam.channels).toHaveLength(16)
        expect(beam.channelsSource).toMatchObject({ basis: 'TESTED', url: null })
        expect(new Set(beam.channels.map((c) => c.role)).size).toBe(16)
        expect(modeOf(typeById(committed, 'UP-250BSW')).channels).toBe(null)
    })

    it('keeps the source and basis of every number, and an unidentified maker stays unknown', () => {
        const beam = typeById(committed, 'UP-B380F')
        expect(beam.power_w).toMatchObject({ value: 500, src: 'A', basis: 'EXACT' })
        expect(beam.sources.A.url).toMatch(/^https:\/\//)
        // UP-LA40WF is on the maker's Chinese site under its own code (2026-09-29): identified.
        expect(typeById(committed, 'UP-LA40WF').identified).toBe('EXACT')
        const co2 = typeById(committed, 'UP-Q108S')
        expect(co2.identified).toBe('EQUIVALENT')
        expect(co2.maker).toBe(null)
        expect(co2.modelledOn).toMatch(/MagicFX/)
        expect(typeById(committed, 'UP-PL5403').power_w.value).toBe(162) // the rating, kept as published
        expect(powerOf(typeById(committed, 'UP-PL5403'))).toBe(200) // what it draws: the stated supply (audit A-05)
        expect(typeById(committed, 'UP-PL5403').power_w).toMatchObject({ basis: 'EXACT', src: 'D-CN' })
    })
})

describe('typeFlags', () => {
    it('names what is wrong in words, and nothing when nothing is', () => {
        expect(typeFlags({ type: 'up-yh600f', mode: '2ch' }, committed)).toEqual([])
        expect(typeFlags({ type: 'up-b380f' }, committed)).toEqual([])
        expect(typeFlags({ type: 'up-250bsw' }, committed).map((f) => f.code)).toEqual(['channels-owed'])
        expect(typeFlags({ type: 'up-q108s' }, committed).map((f) => f.code)).toEqual(['mode-unknown'])
        expect(typeFlags({ type: 'up-b380f', mode: '12ch' }, committed).map((f) => f.code)).toEqual(['mode-unknown'])
        expect(typeFlags({ type: 'nope' }, committed).map((f) => f.code)).toEqual(['unknown-type'])
        expect(typeFlags({ index: 3 }, committed)).toEqual([])
    })
})

describe('typesFromManifest', () => {
    it('refuses a kind with no code, and ids are the lowercased code', () => {
        expect(() => typesFromManifest({ kinds: { x: { code: '' } } })).toThrow(/no usable code/)
        expect(typeIdOf(' UP-B380F ')).toBe('up-b380f')
    })
})
