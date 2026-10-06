// BUILD PIECES — truss, towers and stage decks as data: their size and the points
// where they join. docs/architecture/RIG_BUILD.md §2.3.
//
// A piece in the room is an entity with `components.piece = { kind }`; its kind is
// a key here. Every view (first person, plot, cards) reads the same records, and
// snap.js joins pieces through the points listed here — nothing about a piece's
// shape lives anywhere else (the GLBs are generated from these numbers by
// scripts/rigbuild/pieces-glb.mjs).
//
// Frames (metres, Y up, the room's axes; `yaw` turns a piece about Y):
//   truss   origin at the centre of the section, length along local +X
//   tower   origin at the centre of the base plate, on the floor; top at +height
//   deck    origin at the centre of its footprint, on the floor; top at +height
//
// Sizes are the published outer dimensions of the COMMON RENTAL CLASS, not a load
// table: a 290 mm square box truss (Prolyte H30V, Global Truss F34 — both publish
// 290 mm outer section, 51 mm chords) and a 2 x 1 m stage deck (Prolyte StageDex,
// Litedeck). No load, span or rigging capacity is modelled or implied.

export const GRID_M = 0.5
export const TRUSS_SECTION_M = 0.29
export const TRUSS_CHORD_M = 0.051
export const SLOT_PITCH_M = 0.5

const trussPiece = (length) => {
    const half = length / 2
    const bottom = -TRUSS_SECTION_M / 2
    const slots = []
    // A clamp point every 0.5 m along the bottom, set in from each end by half a
    // pitch — where a crew puts a half-coupler on a box truss's lower chords.
    for (let x = -half + SLOT_PITCH_M / 2; x < half - 1e-9; x += SLOT_PITCH_M) {
        slots.push({ id: `slot-${slots.length + 1}`, kind: 'slot', pos: [round(x), bottom, 0], normal: [0, -1, 0] })
    }
    return {
        kind: `truss-${length}m`,
        label: `Truss ${length} m`,
        category: 'truss',
        length,
        size: [length, TRUSS_SECTION_M, TRUSS_SECTION_M],
        standsOnFloor: false,
        points: [
            { id: 'end-a', kind: 'end', pos: [-half, 0, 0], normal: [-1, 0, 0] },
            { id: 'end-b', kind: 'end', pos: [half, 0, 0], normal: [1, 0, 0] },
            ...slots
        ]
    }
}

const round = (v) => Math.round(v * 1e6) / 1e6

export const TOWER_HEIGHT_M = 6
export const TOWER_PLATE_M = 0.8
export const DECK_HEIGHT_M = 1.0

const towerPiece = (height = TOWER_HEIGHT_M) => ({
    kind: 'tower',
    label: `Tower ${height} m`,
    category: 'tower',
    height,
    size: [TRUSS_SECTION_M, height, TRUSS_SECTION_M],
    plate: [TOWER_PLATE_M, 0.02, TOWER_PLATE_M],
    standsOnFloor: true,
    points: [
        { id: 'base', kind: 'base', pos: [0, 0, 0], normal: [0, -1, 0] },
        // A truss end lands on the top (a top section / sleeve block in practice);
        // the truss's centre line then sits half a section above it.
        { id: 'top', kind: 'top', pos: [0, height, 0], normal: [0, 1, 0] }
    ]
})

const deckPiece = (w = 2, d = 1, h = DECK_HEIGHT_M) => {
    const x = w / 2
    const z = d / 2
    return {
        kind: `deck-${w}x${d}`,
        label: `Stage deck ${w} x ${d} m`,
        category: 'deck',
        size: [w, h, d],
        slab: 0.2,
        standsOnFloor: true,
        points: [
            { id: 'edge-px', kind: 'edge', pos: [x, h, 0], normal: [1, 0, 0] },
            { id: 'edge-nx', kind: 'edge', pos: [-x, h, 0], normal: [-1, 0, 0] },
            { id: 'edge-pz', kind: 'edge', pos: [0, h, z], normal: [0, 0, 1] },
            { id: 'edge-nz', kind: 'edge', pos: [0, h, -z], normal: [0, 0, -1] },
            // Along the long sides a 2 m deck meets a 1 m-wide neighbour at either half.
            { id: 'edge-pz-a', kind: 'edge', pos: [-x / 2, h, z], normal: [0, 0, 1] },
            { id: 'edge-pz-b', kind: 'edge', pos: [x / 2, h, z], normal: [0, 0, 1] },
            { id: 'edge-nz-a', kind: 'edge', pos: [-x / 2, h, -z], normal: [0, 0, -1] },
            { id: 'edge-nz-b', kind: 'edge', pos: [x / 2, h, -z], normal: [0, 0, -1] },
            { id: 'top', kind: 'surface', pos: [0, h, 0], normal: [0, 1, 0], extent: [w, d] }
        ]
    }
}

export const PIECES = Object.fromEntries([
    trussPiece(1), trussPiece(2), trussPiece(3), towerPiece(), deckPiece()
].map((piece) => [piece.kind, piece]))

// A lamp is not a piece but it joins them: its one point is where it is fixed
// (its clamp when hung, its base when standing). The lamp entity's own position is
// its lens (lampGeometry.js converts).
export const LAMP_POINT = { id: 'mount', kind: 'mount', pos: [0, 0, 0], normal: [0, -1, 0] }

export const pieceOf = (kind) => PIECES[kind] || null

// A tower or a deck built to a height other than the catalogue's (a 7 m goalpost, a
// 1.2 m riser). The HEIGHT is the only thing that varies, and in the room it is
// carried by the entity's `transform.scale[1]` against the catalogue body (the GLB
// is drawn at the catalogue height), so a piece's height is always
// `catalogue height x scale.y` — one number, no second copy. A truss has no height
// of its own: its height is where it hangs (its position's y).
export const catalogueHeightOf = (kind) => {
    const piece = PIECES[kind]
    if (!piece || piece.category === 'truss') return null
    return piece.category === 'tower' ? piece.height : piece.size[1]
}

export const pieceWithHeight = (kind, height = null) => {
    const piece = PIECES[kind]
    if (!piece || !Number.isFinite(height) || height <= 0 || piece.category === 'truss') return piece || null
    if (Math.abs(height - catalogueHeightOf(kind)) < 1e-9) return piece
    if (piece.category === 'tower') return { ...towerPiece(height), kind }
    const [w, , d] = piece.size
    return { ...deckPiece(w, d, height), kind }
}

/** A piece entity's real height (tower, deck): catalogue x scale.y; null for a truss. */
export const pieceHeightOf = (entity) => {
    const kind = pieceKindOf(entity)
    const base = kind ? catalogueHeightOf(kind) : null
    if (base == null) return null
    const sy = Number(entity.components?.transform?.scale?.[1])
    return Math.round(base * (Number.isFinite(sy) && sy > 0 ? sy : 1) * 1e6) / 1e6
}

export const pieceKindOf = (entity) => {
    const kind = entity?.components?.piece?.kind
    return typeof kind === 'string' && PIECES[kind] ? kind : null
}

/** A new piece entity's components, for createEntity. */
export const pieceComponents = (kind, { position = [0, 0, 0], yaw = 0 } = {}) => {
    const piece = pieceOf(kind)
    if (!piece) throw new Error(`no piece "${kind}"`)
    return {
        transform: { position: [...position], rotation: [0, yaw, 0], scale: [1, 1, 1] },
        piece: { kind }
    }
}
