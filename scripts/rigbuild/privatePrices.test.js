import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { parsePrices, readPrivatePrices, specWithPrivatePrices, withPrivatePrices } from './privatePrices.mjs'

// All numbers here are INVENTED. The real prices are in the private repo only.
const CSV = 'model,item,amd_1_night,note\r\nUP-A,"a, quoted item",100,x\r\nUP-B,b,,empty\r\nUP-C,c,abc,bad\r\nplan-1,package,900,y\r\n'

describe('privatePrices — the supplier\'s rates, from the owner\'s private file only', () => {
    it('parses model and amd_1_night, honours quotes, skips empty and non-numeric', () => {
        expect([...parsePrices(CSV)]).toEqual([['UP-A', 100], ['plan-1', 900]])
        expect(() => parsePrices('a,b\n1,2')).toThrow(/model and amd_1_night/)
    })
    it('is empty when DI_PRIVATE_PRICES is unset, and reads the named file when set', () => {
        expect(readPrivatePrices({}).size).toBe(0)
        const f = path.join(os.tmpdir(), `dpp-${process.pid}.csv`)
        fs.writeFileSync(f, CSV)
        try { expect(readPrivatePrices({ DI_PRIVATE_PRICES: f }).get('UP-A')).toBe(100) } finally { fs.rmSync(f) }
        expect(() => readPrivatePrices({ DI_PRIVATE_PRICES: '/no/such.csv' })).toThrow()
    })
    it('fills rates into a copy by code and leaves the original and other-supplier lines alone', () => {
        const list = { items: [{ code: 'UP-A', ordered: 1 }, { code: 'EXT-X', ordered: 1, from: 'other' }], catalogue: [{ code: 'UP-A' }] }
        const out = withPrivatePrices(list, parsePrices(CSV))
        expect(out.items[0].rate).toBe(100)
        expect(out.items[1]).not.toHaveProperty('rate')
        expect(out.catalogue[0].rate).toBe(100)
        expect(list.items[0]).not.toHaveProperty('rate')
        expect(withPrivatePrices(list, new Map())).toBe(list)
    })
    it('prices a package by its id', () => {
        const spec = { packages: { items: [{ id: 'plan-1' }, { id: 'plan-2' }] } }
        expect(specWithPrivatePrices(spec, parsePrices(CSV)).packages.items.map((p) => p.rate)).toEqual([900, undefined])
    })
})
