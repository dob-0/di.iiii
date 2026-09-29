// @vitest-environment node
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { buildLibrary, serialise } from '../../scripts/rigbuild/types.mjs'
import { footprintOf, modeOf, powerOf, typeById, typeFlags, typeIdOf, typesFromManifest } from './fixtureTypes.js'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const committed = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/rigbuild/types/moxir.json'), 'utf8'))

describe('the MOXIR type library', () => {
    it('is exactly what the generator makes from the manifest (never edited by hand)', () => {
        const text = fs.readFileSync(path.join(ROOT, 'src/rigbuild/types/moxir.json'), 'utf8')
        expect(serialise(buildLibrary())).toBe(text)
    })

    it('holds the nine rental codes (UP-COB200 since the halo, RIG_BUILD.md §15.8), and the three other-supplier planning types', () => {
        expect(committed.types.map((t) => t.code).filter((c) => c.startsWith('UP-')).sort()).toEqual(
            ['UP-250BSW', 'UP-B380F', 'UP-COB200', 'UP-HK1915', 'UP-LA40WF', 'UP-PL5403', 'UP-Q108S', 'UP-YH600F', 'UP-YZ31P'])
        expect(committed.types.map((t) => t.code).filter((c) => !c.startsWith('UP-')).sort()).toEqual(['EXT-BLINDER', 'EXT-HAZER', 'EXT-STROBE'])
        for (const t of committed.types.filter((x) => x.code.startsWith('EXT-'))) expect(t.identified).toBe('EQUIVALENT')
    })

    it('carries the published footprints and invents none', () => {
        expect(footprintOf(typeById(committed, 'UP-B380F'))).toBe(16)
        expect(typeById(committed, 'up-250bsw').modes.map((m) => m.footprint)).toEqual([24, 30])
        expect(typeById(committed, 'up-hk1915').modes.map((m) => m.footprint)).toEqual([21, 35, 78, 92, 97])
        for (const code of ['UP-PL5403', 'UP-LA40WF', 'UP-Q108S']) {
            const type = typeById(committed, code)
            expect(type.modesOwed).toBe(true)
            expect(type.modes).toEqual([])
            expect(type.defaultMode).toBe(null)
        }
    })

    it('attaches a channel list only where a source gives one, and says where from', () => {
        const spark = typeById(committed, 'UP-YH600F')
        expect(spark.modes[0].channels.map((c) => c.role)).toEqual(['Fountain', 'Control'])
        expect(spark.modes[0].channelsSource.basis).toBe('EQUIVALENT')
        expect(spark.modes[0].channelsSource.url).toMatch(/open-fixture-library\/[0-9a-f]{40}\//)
        expect(modeOf(typeById(committed, 'UP-B380F')).channels).toBe(null)
    })

    it('keeps the source and basis of every number, and an unidentified maker stays unknown', () => {
        const beam = typeById(committed, 'UP-B380F')
        expect(beam.power_w).toEqual({ value: 500, src: 'A', basis: 'EXACT' })
        expect(beam.sources.A.url).toMatch(/^https:\/\//)
        const laser = typeById(committed, 'UP-LA40WF')
        expect(laser.identified).toBe('EQUIVALENT')
        expect(laser.maker).toBe(null)
        expect(laser.modelledOn).toMatch(/Blue Sea/)
        expect(powerOf(typeById(committed, 'UP-PL5403'))).toBe(162)
        expect(typeById(committed, 'UP-PL5403').power_w.basis).toBe('ASSUMED')
    })
})

describe('typeFlags', () => {
    it('names what is wrong in words, and nothing when nothing is', () => {
        expect(typeFlags({ type: 'up-yh600f', mode: '2ch' }, committed)).toEqual([])
        expect(typeFlags({ type: 'up-b380f' }, committed).map((f) => f.code)).toEqual(['channels-owed'])
        expect(typeFlags({ type: 'up-pl5403' }, committed).map((f) => f.code)).toEqual(['mode-unknown'])
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
