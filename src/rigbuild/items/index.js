// THE ITEM CATALOGUE — "what is what": for every device the show can take, a card like a
// game's item: a picture, what it is in plain words, what it does in the show, what it
// needs, its specs and real alternatives, every sentence with its sources.
// docs/architecture/RIG_BUILD.md §13.
//
// Content is data: src/rigbuild/items/<group>.json (schema: SCHEMA.txt beside this file),
// written from cited sources and checked into the repository. The pictures are, first, our
// own studio renders of our own models (renders.json, written by
// scripts/rigbuild/item-renders.py — AGPL, ours), then a freely licensed photo with its
// author and licence. A maker's product photo or manual is never in the repository: it is
// internal reference kept on the studio's own install (media.js / media.json hold only where it
// came from, its sha256 and the id it has there).

import renders from './renders.json'
import { assetUrl, photosOf, rightsLine, verificationOf } from './media.js'

const files = import.meta.glob('./*.json', { eager: true })

const entries = Object.entries(files)
    .filter(([path]) => !path.endsWith('/renders.json') && !path.endsWith('/media.json'))
    .flatMap(([, mod]) => (mod.default || mod).items || [])

export const ITEMS = new Map(entries.map((item) => [item.id, item]))

const BY_CODE = new Map()
for (const item of entries) for (const code of item.codes || []) BY_CODE.set(String(code).toUpperCase(), item)

// Structure pieces share one card per family (the truss card serves 1, 2 and 3 m).
const PIECE_ITEM = { 'truss-1m': 'truss', 'truss-2m': 'truss', 'truss-3m': 'truss', tower: 'tower', 'deck-2x1': 'deck' }

/** The catalogue entry for a type id, a rental code or a piece kind — or null. */
export const itemFor = ({ id = null, code = null, piece = null } = {}) => {
    if (piece && ITEMS.has(PIECE_ITEM[piece] || piece)) return ITEMS.get(PIECE_ITEM[piece] || piece)
    if (id && ITEMS.has(id)) return ITEMS.get(id)
    if (code && BY_CODE.has(String(code).toUpperCase())) return BY_CODE.get(String(code).toUpperCase())
    return null
}

export const GROUPS = [
    ['lights', 'Lights'],
    ['lasers', 'Lasers'],
    ['effects', 'Effects'],
    ['control', 'Control & power'],
    ['structure', 'Structure'],
    ['network', 'Nodes & cables']
]

const CATEGORY_GROUP = {
    'moving-head': 'lights', par: 'lights', wash: 'lights', matrix: 'lights', bar: 'lights', strobe: 'lights', blinder: 'lights', dimmer: 'lights',
    laser: 'lasers',
    'co2-jet': 'effects', 'spark-machine': 'effects', 'smoke-machine': 'effects', hazer: 'effects', 'fog-machine': 'effects', effect: 'effects',
    control: 'control', power: 'control', splitter: 'network', node: 'network', cable: 'network',
    truss: 'structure', tower: 'structure', deck: 'structure'
}

// The rental house's own headings ("Price list" column A) to a group.
const PRICE_HEADING_GROUP = { 'Moving heads': 'lights', 'PAR & wash': 'lights', Lasers: 'lasers', 'Atmosphere & FX': 'effects', 'Control & power': 'control' }

/** The inventory group of anything: its item's group, else its category's, else its price-list heading's. */
export const groupOf = ({ item = null, category = null, heading = null } = {}) => item?.group || CATEGORY_GROUP[category] || PRICE_HEADING_GROUP[heading] || 'control'

/**
 * The pictures to show, in order: the maker's own photos (stored on the local install only —
 * items/media.js; the rental unit's maker before an equivalent's), then our render of our model
 * ("3D model"), then a freely licensed photo. A maker's photo needs `apiBase` (where the install
 * serves its space assets); without it, or with no stored file, there is none.
 */
export const picturesOf = ({ id = null, piece = null, item = null, apiBase = null } = {}) => {
    const out = []
    if (apiBase != null) {
        const v = verificationOf(item?.id || id)
        for (const m of photosOf(item?.id || id)) {
            const url = assetUrl(apiBase, m)
            if (!url) continue
            out.push({ kind: 'maker', src: url, absolute: true, credit: m.maker, rights: rightsLine(m), page: m.page || m.url, url: m.url, fetched: m.fetched, equivalent: Boolean(m.equivalent) || v?.status === 'equivalent', shows: m.title })
        }
    }
    const render = renders.renders?.[piece] || renders.renders?.[id]
    if (render) out.push({ kind: 'render', src: render.file, credit: `our model (${render.model}), rendered in Blender ${renders.blender}`, licence: render.licence })
    const photo = item?.photo
    if (photo?.file) out.push({ kind: 'photo', src: String(photo.file).replace(/^public\//, ''), credit: photo.author, licence: photo.licence, licenceUrl: photo.licenceUrl, page: photo.page, shows: photo.shows })
    return out
}

export const RENDERS = renders
