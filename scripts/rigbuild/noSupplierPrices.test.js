// Guard (owner, 2026-10-05): the rental house's prices are the supplier's, not ours to publish.
// This repo is public. Supplier prices live only in the private repo (dob-0/di-atlas,
// production/rental-house-2026-09-27.csv) and are read on the owner's machine through
// DI_PRIVATE_PRICES (scripts/rigbuild/privatePrices.mjs). This test fails if a price field
// holding a number, or a "<n> AMD" / "<n>/day" text, appears in the rental lists, the
// equipment library or the rig versions file.
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const root = path.resolve(__dirname, '../..')
const ROOTS = ['scripts/rigbuild/rentals', 'src/rigbuild', 'scripts/place/rigs']
const PRICE_KEY = /^(rate|price|prices|amd|amd_\w+|day_?rate|rate_?amd|cost|per_?day|total|tariff)$/i
const PRICE_TEXT = /\b\d[\d ,.]{2,}\s*(AMD|amd)\b|\b\d{4,6}\s*\/\s*(day|night)\b/

const files = (dir) => fs.readdirSync(path.join(root, dir), { withFileTypes: true }).flatMap((e) => {
    const rel = path.join(dir, e.name)
    if (e.isDirectory()) return files(rel)
    return e.name.endsWith('.json') ? [rel] : []
})

const numeric = (v) => (typeof v === 'number' && Number.isFinite(v)) || (typeof v === 'string' && /^\s*\d[\d.,]*\s*$/.test(v))

export const findPrices = (value, at = '$', out = []) => {
    if (Array.isArray(value)) value.forEach((v, i) => findPrices(v, `${at}[${i}]`, out))
    else if (value && typeof value === 'object') {
        for (const [k, v] of Object.entries(value)) {
            if (PRICE_KEY.test(k) && numeric(v)) out.push(`${at}.${k} = ${v}`)
            findPrices(v, `${at}.${k}`, out)
        }
    } else if (typeof value === 'string' && PRICE_TEXT.test(value)) out.push(`${at} = "${value.slice(0, 60)}"`)
    return out
}

describe('no supplier prices in the public repo', () => {
    for (const dir of ROOTS) {
        it(`${dir} holds no price field with a number`, () => {
            const found = files(dir).flatMap((f) => findPrices(JSON.parse(fs.readFileSync(path.join(root, f), 'utf8'))).map((p) => `${f} ${p}`))
            expect(found.slice(0, 10), `${found.length} price values`).toEqual([])
        })
    }
    it('the detector itself sees a price', () => {
        expect(findPrices({ items: [{ rate: 5000 }, { note: 'says 19000/day' }, { stock: 3 }] })).toHaveLength(2)
    })
})
