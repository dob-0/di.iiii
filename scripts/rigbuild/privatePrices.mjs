/**
 * The rental house's prices are the supplier's, not ours to publish; this repo is public
 * (owner, 2026-10-05). They live only in the private repo dob-0/di-atlas
 * (production/rental-house-2026-09-27.csv) and are read HERE, at script time, on the
 * owner's machine, when DI_PRIVATE_PRICES points at that csv (columns: model,amd_1_night;
 * a row whose model is a package id from the versions file prices that package).
 *
 * Node scripts only. Never import this from src/ and never write what it returns into a
 * committed file or a pack: noSupplierPrices.test.js fails the build if a price reaches
 * the rental lists, the equipment library or the versions file.
 */
import fs from 'node:fs'

/** A csv line split on commas, honouring "quoted, fields" and "" escapes (RFC 4180). */
const splitCsv = (line) => {
    const out = []
    let cur = ''
    let quoted = false
    for (let i = 0; i < line.length; i++) {
        const c = line[i]
        if (quoted) {
            if (c === '"' && line[i + 1] === '"') { cur += '"'; i++ } else if (c === '"') quoted = false
            else cur += c
        } else if (c === '"') quoted = true
        else if (c === ',') { out.push(cur); cur = '' } else cur += c
    }
    out.push(cur)
    return out
}

/** model -> AMD for one night, from csv text. Rows without a number are skipped. */
export const parsePrices = (text) => {
    const lines = String(text).split(/\r?\n/).filter((l) => l.trim())
    const head = splitCsv(lines.shift() || '').map((h) => h.trim())
    const m = head.indexOf('model')
    const p = head.indexOf('amd_1_night')
    if (m < 0 || p < 0) throw new Error('private prices csv needs the columns model and amd_1_night')
    const out = new Map()
    for (const line of lines) {
        const cols = splitCsv(line)
        const n = Number(cols[p])
        if (cols[m]?.trim() && cols[p]?.trim() !== '' && Number.isFinite(n)) out.set(cols[m].trim(), n)
    }
    return out
}

/** The prices from the file DI_PRIVATE_PRICES names; an empty map when it is unset. Throws if set but unreadable. */
export const readPrivatePrices = (env = process.env) => {
    const file = env.DI_PRIVATE_PRICES
    if (!file) return new Map()
    return parsePrices(fs.readFileSync(file, 'utf8'))
}

/** A copy of a rental list with `rate` filled from the private prices, by code (lines and catalogue). Pure. */
export const withPrivatePrices = (list, prices) => {
    if (!prices?.size) return list
    const fill = (l) => (l.rate == null && prices.has(l.code) ? { ...l, rate: prices.get(l.code) } : l)
    return { ...list, items: list.items.map(fill), ...(list.catalogue ? { catalogue: list.catalogue.map(fill) } : {}) }
}

/** A copy of the versions spec with each package's `rate` filled from the private prices, by package id. Pure. */
export const specWithPrivatePrices = (spec, prices) => {
    if (!prices?.size || !spec.packages) return spec
    return { ...spec, packages: { ...spec.packages, items: spec.packages.items.map((p) => (p.rate == null && prices.has(p.id) ? { ...p, rate: prices.get(p.id) } : p)) } }
}
