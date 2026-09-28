// THE INVENTORY — every device the show could take, as tiles, the way a game shows what
// a player can pick from. docs/architecture/RIG_BUILD.md §13. Pure.
//
// One tile per device: what the equipment list takes (taken, with its quantity), what
// else the rental house's price list holds (not taken, with its stock and rate), the rig's
// own pieces (truss, towers, decks), and the catalogue's suggestions that no list carries
// yet (a hazer, a network node). A tile is a VIEW of the equipment list and the price
// list — taking, skipping and changing a quantity are list edits (equipment.js), so the
// hotbar, the plot, the cards and the patch sheet follow with no copy of their own.

import { typeById, typeIdOf } from './fixtureTypes.js'
import { isItemLine } from './equipment.js'
import { PIECE_SLOTS } from './hotbar.js'
import { pieceKindOf, pieceOf } from './pieces.js'

const pieceName = (kind) => {
    const p = pieceOf(kind)
    if (!p) return kind
    return p.category === 'truss' ? `truss ${p.length} m` : p.category === 'tower' ? 'tower' : 'deck 2 × 1 m'
}

const PIECE_CATEGORY = { truss: 'truss', tower: 'tower', deck: 'deck' }

/**
 * @param {object} args
 * @param {object} args.model      equipmentModel(...)
 * @param {object[]} args.entities the document's entities
 * @param {(q: {id?, code?, piece?}) => object|null} args.itemFor   the catalogue lookup
 * @param {(q: {item?, category?, heading?}) => string} args.groupOf
 * @param {object[]} [args.extras] catalogue entries to offer when nothing else carries them
 * @returns {object[]} tiles
 */
export const inventoryTiles = ({ model, entities = [], itemFor, groupOf, extras = [] }) => {
    const library = model.library
    const catalogue = model.catalogue || []
    const catByCode = new Map(catalogue.map((c) => [c.code.toUpperCase(), c]))
    const pieces = new Map()
    for (const e of entities) {
        const k = pieceKindOf(e)
        if (k) pieces.set(k, (pieces.get(k) || 0) + 1)
    }
    const tiles = []
    const seenCodes = new Set()
    const seenPieces = new Set()
    const seenItems = new Set()
    const seenTypes = new Set()

    for (const line of model.lines) {
        const cat = catByCode.get(String(line.code).toUpperCase()) || null
        const type = line.kind === 'fixture' ? typeById(library, line.type) : null
        const item = itemFor({ id: line.type, code: line.code, piece: line.piece })
        if (item) seenItems.add(item.id)
        seenCodes.add(String(line.code).toUpperCase())
        if (line.piece) seenPieces.add(line.piece)
        if (type) seenTypes.add(type.id)
        const placeable = Boolean(type) || Boolean(line.piece)
        tiles.push({
            id: line.unlisted ? `unlisted:${line.type}` : line.key,
            key: line.unlisted ? null : line.key,
            group: groupOf({ item, category: line.category, heading: cat?.category }),
            name: item?.name || line.label || line.code,
            code: line.code,
            label: line.label,
            item,
            line,
            cat,
            typeId: type?.id || null,
            piece: line.piece || null,
            taken: !line.unlisted,
            taking: line.unlisted ? 0 : line.ordered,
            available: line.stock ?? cat?.stock ?? null,
            placed: line.placed,
            rate: line.rate ?? cat?.rate ?? null,
            from: line.from,
            flags: line.flags,
            modeOwed: line.modeOwed,
            placeable,
            hotbarId: type ? `lamp:${type.id}` : line.piece || null
        })
    }

    for (const cat of catalogue) {
        const code = cat.code.toUpperCase()
        if (seenCodes.has(code)) continue
        seenCodes.add(code)
        const type = typeById(library, typeIdOf(cat.code))
        const item = itemFor({ id: typeIdOf(cat.code), code: cat.code })
        if (item) seenItems.add(item.id)
        if (type) seenTypes.add(type.id)
        tiles.push({
            id: `cat:${cat.code}`, key: null,
            group: groupOf({ item, category: type?.category, heading: cat.category }),
            name: item?.name || cat.label || cat.code, code: cat.code, label: cat.label,
            item, line: null, cat, typeId: type?.id || null, piece: null,
            taken: false, taking: 0, available: cat.stock ?? null, placed: 0, rate: cat.rate ?? null,
            from: 'rental', flags: [], modeOwed: type ? Boolean(type.modesOwed) : null,
            placeable: Boolean(type), hotbarId: null
        })
    }

    for (const kind of PIECE_SLOTS) {
        if (seenPieces.has(kind)) continue
        const item = itemFor({ piece: kind })
        if (item) seenItems.add(item.id)
        tiles.push({
            id: `piece:${kind}`, key: null, group: 'structure',
            name: pieceName(kind), code: pieceName(kind), label: item?.name || '',
            item, line: null, cat: null, typeId: null, piece: kind,
            taken: false, taking: 0, available: null, placed: pieces.get(kind) || 0, rate: null,
            from: null, flags: [], modeOwed: null, placeable: true, hotbarId: kind,
            category: PIECE_CATEGORY[pieceOf(kind)?.category] || 'other'
        })
    }

    for (const type of library?.types || []) {
        if (seenTypes.has(type.id)) continue
        const item = itemFor({ id: type.id, code: type.code })
        if (item) seenItems.add(item.id)
        tiles.push({
            id: `type:${type.id}`, key: null, group: groupOf({ item, category: type.category }),
            name: item?.name || type.product || type.code, code: type.code, label: type.product || '',
            item, line: null, cat: null, typeId: type.id, piece: null,
            taken: false, taking: 0, available: null, placed: 0, rate: null,
            from: null, flags: [], modeOwed: Boolean(type.modesOwed), placeable: true, hotbarId: null
        })
    }

    for (const item of extras) {
        if (seenItems.has(item.id) || ['truss', 'tower', 'deck'].includes(item.id)) continue
        tiles.push({
            id: `extra:${item.id}`, key: null, group: item.group || 'control',
            name: item.name, code: `${item.codes?.[0] || 'not on the price list'} · suggested`, label: '',
            item, line: null, cat: null, typeId: null, piece: null,
            taken: false, taking: 0, available: null, placed: 0, rate: null,
            from: null, flags: [], modeOwed: null, placeable: false, hotbarId: null, suggested: true
        })
    }
    return tiles
}

/** Tiles by group, in the groups' order; taken first, then by name. */
export const byGroup = (tiles, groups) => groups.map(([id, label]) => ({
    id,
    label,
    tiles: tiles.filter((t) => t.group === id).sort((a, b) => Number(b.taken) - Number(a.taken) || String(a.name).localeCompare(String(b.name)))
})).filter((g) => g.tiles.length)

/** The words under a tile: "taking 12 / 18 available", "not taken · 6 available". */
export const tileWords = (tile) => {
    const avail = tile.available != null ? `${tile.available} available` : tile.from === 'own' ? 'own' : tile.from === 'other' ? 'other supplier' : ''
    if (!tile.taken) {
        if (tile.placed) return `${tile.placed} placed · not on the list`
        return ['not taken', avail].filter(Boolean).join(' · ')
    }
    return `taking ${tile.taking}${tile.available != null ? ` / ${tile.available} available` : avail ? ` · ${avail}` : ''}`
}

/** A search over tiles: name, code, label and the item's words. */
export const matchTile = (tile, query) => {
    const q = String(query || '').trim().toLowerCase()
    if (!q) return true
    return [tile.name, tile.code, tile.label, tile.item?.product, tile.item?.what].some((s) => String(s || '').toLowerCase().includes(q))
}

/**
 * The hotbar as the person arranged it (the inventory's "to hotbar"): `pinned` slot ids in
 * order, each kept only while the hand can still take it; unpinned, the default order.
 */
export const arrangeSlots = (slots, pinned) => {
    if (!Array.isArray(pinned) || !pinned.length) return slots
    const byId = new Map(slots.map((s) => [s.id, s]))
    const out = pinned.map((id) => byId.get(id)).filter(Boolean).slice(0, 10)
    const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0']
    return out.map((s, i) => ({ ...s, key: KEYS[i] || null }))
}

/**
 * Put a slot id into the hotbar at `at`, replacing what was there (as a game's hotbar
 * does), or at the end. `current` seeds a hotbar nobody has arranged yet.
 */
export const pinAt = (pinned, id, at = null, current = []) => {
    const list = [...(pinned?.length ? pinned : current)]
    const was = list.indexOf(id)
    if (was >= 0) list.splice(was, 1)
    if (at == null || at >= list.length) list.push(id)
    else list[at] = id
    return list.slice(0, 10)
}

export const isLineItem = isItemLine
