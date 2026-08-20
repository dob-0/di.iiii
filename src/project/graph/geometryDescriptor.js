// What travels down a geometry wire.
//
// Not a THREE object, not JSX — a plain description: { kind, …dimensions,
// color, position, rotation }. Chosen over live geometry instances for the
// same reason the runtime injects `now` instead of reading a clock: evaluation
// stays pure, so the same document and the same inputs always describe the
// same shape, and a descriptor can be asserted in a unit test without a WebGL
// context in sight. The viewport turns descriptions into meshes at the end,
// exactly as it already turns a node's own values into meshes.
//
// This is the `geometry` port type — declared in PORT_TYPES since the
// beginning and carried by nothing until now — finally carrying something.
export const GEOMETRY_KINDS = new Set(['box', 'sphere', 'plane', 'cylinder', 'cone', 'torus', 'group'])

// A graph is allowed to describe something absurd — two constructors merged
// into each other through enough Merge nodes make a tree, and trees grow. The
// caps are what stop one wire freezing the room. Generous on purpose: a person
// building by hand meets neither; a runaway meets both.
export const MAX_GEOMETRY_DEPTH = 16
export const MAX_GEOMETRY_PIECES = 256

export const isGeometryDescriptor = (value) =>
    Boolean(value) && typeof value === 'object' && !Array.isArray(value)
    && GEOMETRY_KINDS.has(value.kind)
    && (value.kind !== 'group' || Array.isArray(value.children))

/**
 * How many drawable pieces a descriptor holds, counted the way the renderer
 * walks it — same caps, so "what the count says" and "what gets drawn" cannot
 * disagree.
 */
export function countGeometryPieces(descriptor, depth = 0) {
    if (!isGeometryDescriptor(descriptor) || depth >= MAX_GEOMETRY_DEPTH) return 0
    if (descriptor.kind !== 'group') return 1
    let count = 0
    for (const child of descriptor.children) {
        count += countGeometryPieces(child, depth + 1)
        if (count >= MAX_GEOMETRY_PIECES) return MAX_GEOMETRY_PIECES
    }
    return count
}

/**
 * The same walk the renderer draws, as a PURE prune: returns a descriptor
 * tree already inside the caps (leaves counted across the whole tree, depth
 * counted down the branches), so the renderer needs no budget of its own.
 *
 * This exists because the renderer used to carry one shared mutable countdown
 * through recursion — safe only while R3F v8 keeps StrictMode out of the
 * Canvas; a double-invoked render would have silently halved the cap. A prune
 * is idempotent: run it twice, get the same tree.
 */
export function pruneGeometryDescriptor(descriptor, { maxPieces = MAX_GEOMETRY_PIECES, maxDepth = MAX_GEOMETRY_DEPTH } = {}) {
    const budget = { left: maxPieces }
    const walk = (value, depth) => {
        if (!isGeometryDescriptor(value) || depth >= maxDepth || budget.left <= 0) return null
        if (value.kind !== 'group') {
            budget.left -= 1
            return value
        }
        const children = []
        for (const child of value.children) {
            const kept = walk(child, depth + 1)
            if (kept) children.push(kept)
            if (budget.left <= 0) break
        }
        return { ...value, children }
    }
    return walk(descriptor, 0)
}

/**
 * Merge any number of descriptors into one. Empty and invalid entries drop
 * out; nothing left means undefined — a Merge with nothing wired in carries
 * nothing, and "nothing" must stay distinguishable from "an empty group".
 */
export function mergeGeometry(parts) {
    const kept = (parts || []).filter(isGeometryDescriptor)
    if (!kept.length) return undefined
    if (kept.length === 1) return kept[0]
    // Bare groups are SPLICED, not nested. A group without a transform adds no
    // coordinate frame — only depth — and every group a merge chain produces
    // is bare, so without this a chain of N Merges (the documented way to
    // combine more than two parts) built a descriptor N levels deep and hit
    // MAX_GEOMETRY_DEPTH at seventeen hand-placed parts. MEASURED, by the
    // review that caught it: sphere 17 arrives and spheres 1 and 2 silently
    // vanish from the worn shape, deepest-first, with the piece count agreeing
    // with the loss so nothing even flags it. Groups carrying a transform keep
    // their frame and their depth.
    const children = kept.flatMap((part) => (
        part.kind === 'group' && part.position == null && part.rotation == null && part.scale == null
            ? part.children
            : [part]
    ))
    return { kind: 'group', children }
}
