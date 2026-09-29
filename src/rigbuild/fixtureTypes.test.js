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

    it('holds the eight rental codes, and the three other-supplier planning types', () => {
        expect(committed.types.map((t) => t.code).filter((c) => c.startsWith('UP-')).sort()).toEqual(
            ['UP-250BSW', 'UP-B380F', 'UP-HK1915', 'UP-LA40WF', 'UP-PL5403', 'UP-Q108S', 'UP-YH600F', 'UP-YZ31P'])
        expect(committed.types.map((t) => t.code).filter((c) => !c.startsWith('UP-')).sort()).toEqual(['EXT-BLINDER', 'EXT-HAZER', 'EXT-STROBE'])
        for (const t of committed.types.filter((x) => x.code.startsWith('EXT-'))) expect(t.identified).toBe('EQUIVALENT')
    })

    it('carries the published footprints and invents none', () => {
        expect(footprintOf(typeById(committed, 'UP-B380F'))).toBe(16)
        // The maker's (or the named equivalent's) published modes, unchanged; the ASSUMED
        // test modes (assumedProfiles.js) sit beside them, each marked, never in their place.
        const real = (t) => t.modes.filter((m) => !isAssumedMode(m))
        expect(real(typeById(committed, 'up-250bsw')).map((m) => m.footprint)).toEqual([24, 30])
        expect(real(typeById(committed, 'up-hk1915')).map((m) => m.footprint)).toEqual([21, 35, 78, 92, 97])
        // UP-PL5403 has ONE published mode, 8ch (uplight.com.cn, 2026-09-29); its list is owed.
        expect(real(typeById(committed, 'up-pl5403')).map((m) => [m.name, m.channels])).toEqual([['8ch', null]])
        for (const code of ['UP-LA40WF', 'UP-Q108S']) {
            const type = typeById(committed, code)
            expect(type.modesOwed).toBe(true)
            expect(real(type)).toEqual([])
            expect(type.modes.every((m) => m.basis === 'ASSUMED' && /-assumed$/.test(m.name))).toBe(true)
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
        expect(beam.power_w).toMatchObject({ value: 500, src: 'A', basis: 'EXACT' })
        expect(beam.sources.A.url).toMatch(/^https:\/\//)
        // UP-LA40WF is on the maker's Chinese site under its own code (2026-09-29): identified.
        expect(typeById(committed, 'UP-LA40WF').identified).toBe('EXACT')
        const co2 = typeById(committed, 'UP-Q108S')
        expect(co2.identified).toBe('EQUIVALENT')
        expect(co2.maker).toBe(null)
        expect(co2.modelledOn).toMatch(/MagicFX/)
        expect(powerOf(typeById(committed, 'UP-PL5403'))).toBe(162)
        expect(typeById(committed, 'UP-PL5403').power_w).toMatchObject({ basis: 'EXACT', src: 'D-CN' })
    })
})

describe('typeFlags', () => {
    it('names what is wrong in words, and nothing when nothing is', () => {
        expect(typeFlags({ type: 'up-yh600f', mode: '2ch' }, committed)).toEqual([])
        expect(typeFlags({ type: 'up-b380f' }, committed).map((f) => f.code)).toEqual(['channels-owed'])
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
