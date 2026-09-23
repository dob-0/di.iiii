// THE WALL THE FOOTAGE HANGS ON — one copy, two callers.
//
// `sources` is a room, not a folder: the photographs and clips a hall was built
// from, hung where a visitor can stand in front of them. It was written once for
// the batch importer (scripts/place/import.mjs, step 5 of the place pipeline)
// and is now also written to live, one picture at a time, by a phone at
// /{space}/scan. Two layouts would drift, and a wall that hangs one way when a
// script builds it and another way when a phone does is two rooms.
//
// So the geometry lives here and both import it — the script by relative path
// (node runs this file as plain ESM; scripts/normalise-page-asset-urls.mjs and
// scripts/space-new.mjs already reach into src/ the same way), the surface as an
// ordinary module.
//
// WHAT WENT WRONG THE FIRST TIME, and why the numbers look odd:
// an image or video object in di.iiii is a plane 3 units tall lying FLAT ON THE
// GROUND (rotation-x = -PI/2 inside ImageObject/VideoObject), and its width
// follows the picture's own shape. So a wall of them needs a quarter turn about
// X to stand each one up, and a scale relative to that built-in height of 3.
// Left flat they are invisible from standing height — a room with a horizon and
// nothing in it.

export const SOURCE_WALL_DEFAULTS = {
    perRow: 8,
    tile: 1.1,       // how tall each one hangs, in metres
    gap: 0.3,
    distance: 3,     // how far in front of the arrival point the wall stands
    baseHeight: 1.6  // the bottom row at eye height
}

// Columns are spaced for a landscape photograph, which is what a phone hands
// over: wider than it is tall, about 3:2.
const columnStepFor = (tile, gap) => tile * 1.7 + gap
const rowStepFor = (tile, gap) => tile + gap

/**
 * Where the nth picture hangs.
 *
 * `total` is the difference between the two callers, and it is the whole reason
 * this function takes an index rather than a list:
 *
 *   TOTAL KNOWN (the batch importer) — the wall is centred on the pictures it
 *   has, and row 0 is the TOP row, so a wall of 12 reads left-to-right,
 *   top-to-bottom the way a contact sheet does.
 *
 *   TOTAL UNKNOWN (a phone, mid-walk) — the wall is centred on a FULL row of
 *   `perRow` and grows upward from a fixed bottom row. Nothing already hung
 *   ever moves. This matters more than the contact-sheet reading: a person
 *   watching the wall fill while they walk must not see the pictures they
 *   already took slide sideways every time they take another one, and an op
 *   that repositions every existing object on every capture is forty ops for
 *   the fortieth still.
 *
 * @param {number} index 0-based.
 * @param {{perRow?: number, tile?: number, gap?: number, distance?: number, baseHeight?: number, total?: number|null}} options
 */
export const sourceWallSlot = (index, options = {}) => {
    const { perRow, tile, gap, distance, baseHeight } = { ...SOURCE_WALL_DEFAULTS, ...options }
    const total = Number.isFinite(options.total) ? options.total : null
    const columnStep = columnStepFor(tile, gap)
    const rowStep = rowStepFor(tile, gap)
    const scale = tile / 3
    const row = Math.floor(index / perRow)
    const column = index % perRow
    const columnsWide = total === null ? perRow : Math.min(total, perRow)
    const width = columnsWide * columnStep
    const rows = total === null ? null : Math.ceil(total / perRow)
    const height = baseHeight + (rows === null ? row : rows - 1 - row) * rowStep
    return {
        position: [
            -width / 2 + columnStep / 2 + column * columnStep,
            height,
            -distance
        ],
        // Standing up, and nothing else: a picture on a wall is not a thing
        // that leans.
        rotation: [Math.PI / 2, 0, 0],
        scale: [scale, scale, scale]
    }
}

/**
 * One object on the wall, ready for a `createEntity` op.
 *
 * `animation.mode: 'static'` is not decoration. An object with no authored
 * animation falls back to "models float" (src/project/viewport/entityAnimation.js)
 * and every photograph on the wall bobs gently in the air.
 */
export const sourceWallEntity = (asset, index, options = {}) => {
    const isVideo = String(asset?.mimeType || '').startsWith('video')
    return {
        id: options.id || `source-${index + 1}`,
        type: isVideo ? 'video' : 'image',
        // The name is the only place a capture's own story can live — what kind
        // it was, how long it ran. An object keeps id/type/name/parentId/
        // createdBy/components and nothing else (normalizeEntity returns a fixed
        // literal), so an invented field would be saved and then forgotten.
        name: options.name || asset?.name || `source ${index + 1}`,
        components: {
            transform: sourceWallSlot(index, options),
            media: {
                assetId: asset?.id,
                fit: 'contain',
                ...(isVideo ? { autoplay: false, loop: true, muted: true, spatial: false } : {})
            },
            animation: { mode: 'static', speed: 1, amplitude: 1 }
        }
    }
}

/**
 * A whole wall at once — the batch importer's shape, unchanged. A plain wall of
 * what the room was made of: rows, left to right, at eye height and above. Not a
 * gallery — a working wall you can stand in front of.
 */
export const sourceWall = (assets, options = {}) => {
    const list = Array.isArray(assets) ? assets : []
    return list.map((asset, index) => sourceWallEntity(asset, index, { ...options, total: list.length }))
}

// THE MEASURED WALL, written where a person can read it.
//
// A reconstruction from photographs has no size in it (docs/architecture/PLACE.md,
// the guess/measured rule): a hall and a model of a hall are the same pile of
// numbers, and somebody has to say how big the room is. On the phone that
// somebody is the person standing in it with a tape, and the number they type is
// the single most valuable thing the whole walk produces.
//
// So it is written into the room as TEXT, beside the footage, and not only into
// a build argument — a number that exists only as a command-line flag is a
// number nobody can check afterwards. `document.entities` is also the only place
// it can honestly live: `normalizeProjectDocument` returns a fixed set of keys
// and silently drops anything else, so an invented document field would be saved
// and then forgotten (paid for on 2026-08-24, docs/ai/golden_rules.md). The build
// route reads the metres back out of this label.
export const MEASURED_WALL_ENTITY_ID = 'scan-measured-wall'

/** `8.3` → `'wall · 8.30 m'`. Two decimals, because a tape gives centimetres. */
export const measuredWallLabel = (metres) => {
    const value = Number(metres)
    if (!Number.isFinite(value) || value <= 0) return ''
    return `wall · ${value.toFixed(2)} m`
}

/** And back again — `'wall · 8.30 m'` → `8.3`, or null if it says no such thing. */
export const readMeasuredWallLabel = (label) => {
    const match = /(-?\d+(?:\.\d+)?)\s*m\b/.exec(String(label || ''))
    if (!match) return null
    const value = Number(match[1])
    return Number.isFinite(value) && value > 0 ? value : null
}

/**
 * The label as an object in the room: a caption under the first picture.
 *
 * It stood BESIDE the wall at first — one slot beyond the left-hand edge of a
 * full eight-wide row — and on a wall of six it was metres off the side of the
 * arrival shot, invisible in both orientations (seen 2026-09-22). The number is
 * the most valuable thing a walk produces; it has to be where the footage is,
 * not out in the dark next to where the footage would be if there were more of
 * it. So it hangs under slot 0, which never moves.
 */
export const measuredWallEntity = (metres, options = {}) => {
    const label = measuredWallLabel(metres)
    if (!label) return null
    const { tile, distance, baseHeight } = { ...SOURCE_WALL_DEFAULTS, ...options }
    const firstSlot = sourceWallSlot(0, options)
    return {
        id: MEASURED_WALL_ENTITY_ID,
        type: 'text',
        name: label,
        components: {
            transform: {
                position: [firstSlot.position[0], baseHeight - tile * 0.75, -distance],
                // The same quarter turn the pictures take, and for the same
                // reason: a text object lies FLAT ON THE GROUND like an image
                // does, and `billboard: true` did not stand it up in the
                // published view — seen 2026-09-22, the number read as a blue
                // smear on the floor. A caption on a wall is on the wall anyway;
                // it should not spin to follow somebody round the room.
                rotation: [Math.PI / 2, 0, 0],
                scale: [1, 1, 1]
            },
            text: { value: label, variant: '2d', billboard: false },
            animation: { mode: 'static', speed: 1, amplitude: 1 }
        }
    }
}

// THE ROOM THE WALL STANDS IN — set once, when the room is made.
//
// Without this the footage room arrives as the default grey grid and the viewer
// frames it from the objects' own bounding sphere. For a wall — one thin, wide,
// flat thing — that puts the camera high above and behind it, and six
// photographs read as a strip on the floor. Seen, 2026-09-22, on the first
// phone-collected room.
//
// It is the same lesson import.mjs learned for the hall and wrote down there:
// "a room's arrival is framed from where its entities are", and 'scene' entry
// auto-frames while 'fixed-camera' honours the shot. A wall needs the shot even
// more than a hall does, because a hall at least surrounds you.
//
// Written ONCE, when the room is created, and never again — somebody who has
// since moved the arrival point keeps their change.
export const sourceRoomOps = (options = {}) => {
    const { perRow, tile, gap, distance, baseHeight } = { ...SOURCE_WALL_DEFAULTS, ...options }
    // Far enough back to see a full row, at eye height, looking at the middle of
    // the second row up — where the wall's mass is once it has more than eight
    // pictures on it.
    const standBack = distance + Math.max(4, perRow * columnStepFor(tile, gap) * 0.45)
    const lookAt = [0, baseHeight + tile * 0.6, -distance]
    const shot = {
        projection: 'perspective',
        position: [0, baseHeight, standBack - distance],
        target: lookAt,
        fov: 60,
        zoom: 1,
        near: 0.05,
        far: 200,
        locked: false
    }
    return [
        {
            type: 'setWorldState',
            payload: {
                patch: {
                    backgroundColor: '#0a1118',
                    gridVisible: false,
                    spawn: { x: 0, z: standBack - distance, yaw: Math.PI, pitch: 0, altY: baseHeight },
                    savedView: { mode: 'perspective', ...shot }
                }
            }
        },
        {
            type: 'setPresentationState',
            payload: {
                patch: {
                    mode: 'fixed-camera',
                    entryView: 'fixed-camera',
                    fixedCamera: shot
                }
            }
        }
    ]
}
