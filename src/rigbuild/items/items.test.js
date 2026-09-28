import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { GROUPS, ITEMS, RENDERS, itemFor, picturesOf } from './index.js'
import rental from '../../../scripts/rigbuild/rentals/moxir-2026-10-17.json'

// The item catalogue is content with provenance (RIG_BUILD.md §13): these hold it to its own
// rules, so a card can never show a sentence without a source key that resolves, a photo
// without its licence, or a price-list code without a card.
const PUBLIC = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../../public')
const groups = new Set(GROUPS.map(([id]) => id))
const PREVIEWS = new Set(['beam', 'spot', 'wash', 'matrix', 'laser-fan', 'laser-swing', 'co2', 'sparks', 'smoke', 'haze', 'lowfog', 'mist', 'effect', 'none'])

describe('the item catalogue', () => {
    it('has a card for every code on the rental house\'s price list, and for the hazer, the node and the rig pieces', () => {
        const codes = rental.rentalList.catalogue.map((c) => c.code)
        expect(codes).toHaveLength(25)
        for (const code of codes) expect(itemFor({ code }), code).toBeTruthy()
        for (const id of ['hazer', 'artnet-node', 'truss', 'tower', 'deck']) expect(ITEMS.has(id), id).toBe(true)
        expect(itemFor({ piece: 'truss-2m' }).id).toBe('truss')
        expect(itemFor({ id: 'ofl-mdg-atme', code: 'MDG ATMe' }).id).toBe('hazer')
    })
    it('says every sentence with a source key that resolves, or says it is owed', () => {
        for (const item of ITEMS.values()) {
            expect(groups.has(item.group), `${item.id} group`).toBe(true)
            expect(PREVIEWS.has(item.preview), `${item.id} preview`).toBe(true)
            expect(item.name && item.what, `${item.id} name/what`).toBeTruthy()
            const keys = new Set(Object.keys(item.sources || {}))
            const cited = (list, where) => {
                for (const k of list || []) expect(keys.has(k), `${item.id} ${where}: ${k}`).toBe(true)
            }
            cited(item.whatSources, 'what')
            cited(item.inShowSources, 'inShow')
            if (!(item.whatSources || []).length) expect(item.what, `${item.id}: what has no source`).toMatch(/owed/)
            for (const n of item.needs || []) cited(n.sources, 'needs')
            for (const s of item.specs || []) { cited(s.sources, `spec ${s.label}`); if (!(s.sources || []).length) expect(s.value).toMatch(/owed/) }
            for (const a of item.alternatives || []) { cited(a.sources, `alt ${a.model}`); expect(a.url, `${item.id} alt ${a.model}`).toMatch(/^https?:\/\//) }
            for (const [k, s] of Object.entries(item.sources || {})) expect(s.url || s.what, `${item.id} source ${k}`).toBeTruthy()
        }
    })
    it('shows a photo only with its author, licence and page, and the file is there', () => {
        for (const item of ITEMS.values()) {
            const p = item.photo
            if (!p) continue
            expect(p.author && p.licence && p.page, `${item.id} photo credit`).toBeTruthy()
            expect(p.page, `${item.id} photo page`).toMatch(/^https:\/\/commons\.wikimedia\.org\//)
            expect(fs.existsSync(path.join(PUBLIC, String(p.file).replace(/^public\//, ''))), `${item.id} ${p.file}`).toBe(true)
        }
    })
    it('puts our own render first, and every render file is there', () => {
        for (const [id, r] of Object.entries(RENDERS.renders)) expect(fs.existsSync(path.join(PUBLIC, r.file)), id).toBe(true)
        const pics = picturesOf({ id: 'up-yz31p', item: ITEMS.get('up-yz31p') })
        expect(pics.map((p) => p.kind)).toEqual(['render', 'photo'])
        expect(picturesOf({ piece: 'tower', item: ITEMS.get('tower') })[0].kind).toBe('render')
    })
})
