// LASER TRACE — geometry -> laser paths (frame v2). Design: the raw laser workflow decision of 2026-10-14 (docs/ai/decisions, with PR 933) §2.2.
//
// Pure: a geometry descriptor and a view in, a v2 laser frame out. No React, no DOM; three.js core only
// (it runs in node, so a headless runner can use it later).
//
//  1. WALK the descriptor with the renderer's own walk (pruneGeometryDescriptor: same caps, same order),
//     composing group position/rotation/scale exactly as RawViewport's GeometryPieces does (R3F: Euler XYZ,
//     a leaf's place group carries position + rotation, the mesh inside it is lifted to stand on the floor).
//  2. OBJECT-SPACE PATHS per piece, CACHED by kind + dimensions + mode (bench: caching is 6-8x faster):
//       outline   (default) few clean lines: box 12 edges, plane 4, circle 1 ring, line 1, cylinder 2 rims +
//                 2 silhouette sides, cone 1 rim + 2 silhouette sides, sphere its silhouette ring, torus outer
//                 and inner equator + 4 meridians. Silhouettes are exact, worked out per frame in the piece's
//                 own space (Markosian et al. 1997: edges between a front- and a back-facing face).
//       edges     three.js EdgesGeometry(the viewport's own BufferGeometry, angle)
//       wireframe every mesh edge (three.js WireframeGeometry), like a TD wireframe
//       points    every distinct mesh vertex as a dot (the server's still-beam guard watches dots)
//     Segments are CHAINED into polylines once, in object space (vpype `linemerge` practice).
//  3. PER FRAME: transform, project (front: orthographic; point: by angle, as a galvo deflects,
//     x = atan2(x, -z) / half-field), clip at the near plane and the field edge (Liang & Barsky 1984).
//     Never clamp: a clamped line would draw a false line along the edge.
//  4. COLOUR per piece from the descriptor (what the viewport shows), times level; a wired colour overrides.
import {
    BoxGeometry, CircleGeometry, ConeGeometry, CylinderGeometry, EdgesGeometry, Euler, Matrix4, PlaneGeometry,
    Quaternion, SphereGeometry, TorusGeometry, Vector3, WireframeGeometry,
} from 'three'
import { pruneGeometryDescriptor } from '../../graph/geometryDescriptor.js'
import {
    CIRCLE_SEGMENTS, CONE_RADIAL_SEGMENTS, CYLINDER_RADIAL_SEGMENTS, SPHERE_HEIGHT_SEGMENTS, SPHERE_WIDTH_SEGMENTS,
    TORUS_RADIAL_SEGMENTS, TORUS_TUBULAR_SEGMENTS,
} from '../../../objectComponents/primitiveSegments.js'
import { FRAME_VERSION } from '../../../shared/laserFrame.js'

export const TRACE_MODES = ['outline', 'edges', 'wireframe', 'points']
export const TRACE_VIEWS = ['front', 'point']
// Half the cube's field, the same ASSUMPTION as src/objectComponents/laserLine.js (maker's ">37°").
export const FIELD_HALF_DEG = 18.5
// Default fit for the front view: the shape's bounds fill 80 % of the field.
export const FIT_FRACTION = 0.8
export const DEFAULT_ANGLE = 30
export const NEAR = 0.01
// A path shorter than this in field units (4 steps of a 12-bit DAC) is not drawn.
export const MIN_PATH_LENGTH = 0.002
const TORUS_MERIDIANS = 4
const MAX_SEGMENTS_PER_PIECE = 6000
const MAX_DOTS_PER_PIECE = 2000
const CACHE_MAX = 512

const finite = (v, fallback = 0) => {
    const n = Number(v)
    return Number.isFinite(n) ? n : fallback
}
const vec3 = (v, fallback) => (Array.isArray(v) ? [0, 1, 2].map((i) => finite(v[i], fallback[i])) : fallback)
const dim = (v, fallback, max = 100) => Math.min(max, Math.max(0.001, Math.abs(finite(v, fallback))))
const posVec3 = (v, fallback, max = 100) => vec3(v, fallback).map((x, i) => Math.min(max, Math.max(0.001, Math.abs(finite(x, fallback[i])))))

/** The viewport's numbers for one piece (RawViewport GeometryPieces + the *Object components). Pure. */
export const pieceShape = (leaf) => {
    switch (leaf?.kind) {
        case 'box': { const size = posVec3(leaf.size, [1, 1, 1]); return { kind: 'box', dims: size, lift: size[1] / 2, colour: leaf.color ?? '#5fa8ff' } }
        case 'sphere': { const r = dim(leaf.radius, 0.5); return { kind: 'sphere', dims: [r], lift: r, colour: leaf.color ?? '#5fa8ff' } }
        case 'plane': return { kind: 'plane', dims: [dim(leaf.width, 2), dim(leaf.height, 2)], lift: 0, colour: leaf.color ?? '#ffffff' }
        case 'cylinder': { const h = dim(leaf.height, 1.5); return { kind: 'cylinder', dims: [dim(leaf.radius, 0.5), h], lift: h / 2, colour: leaf.color ?? '#5fa8ff' } }
        case 'cone': { const h = dim(leaf.height, 1.5); return { kind: 'cone', dims: [dim(leaf.radius, 0.5), h], lift: h / 2, colour: leaf.color ?? '#5fa8ff' } }
        case 'torus': { const R = dim(leaf.radius, 0.5); const t = dim(leaf.tube, 0.18); return { kind: 'torus', dims: [R, t], lift: R + t, colour: leaf.color ?? '#5fa8ff' } }
        case 'circle': return { kind: 'circle', dims: [dim(leaf.radius, 0.5)], lift: 0, colour: leaf.color ?? '#5fa8ff' }
        case 'line': return { kind: 'line', from: vec3(leaf.from, [0, 0, 0]), to: vec3(leaf.to, [0, 1.5, 0]), lift: 0, colour: leaf.color ?? '#ffffff' }
        default: return null
    }
}

// The same BufferGeometry the viewport builds (same arguments, same segment counts).
const meshOf = (shape) => {
    const [a, b, c] = shape.dims
    switch (shape.kind) {
        case 'box': return new BoxGeometry(a, b, c)
        case 'sphere': return new SphereGeometry(a, SPHERE_WIDTH_SEGMENTS, SPHERE_HEIGHT_SEGMENTS)
        case 'plane': return new PlaneGeometry(a, b)
        case 'cylinder': return new CylinderGeometry(a, a, b, CYLINDER_RADIAL_SEGMENTS)
        case 'cone': return new ConeGeometry(a, b, CONE_RADIAL_SEGMENTS)
        case 'torus': return new TorusGeometry(a, b, TORUS_RADIAL_SEGMENTS, TORUS_TUBULAR_SEGMENTS)
        case 'circle': return new CircleGeometry(a, CIRCLE_SEGMENTS)
        default: return null
    }
}

// A ring: centre c, in the plane of unit vectors u, v.
const ring = (c, u, v, radius, n) => {
    const pts = new Float64Array(n * 3)
    for (let k = 0; k < n; k += 1) {
        const a = (2 * Math.PI * k) / n
        const cs = Math.cos(a) * radius
        const sn = Math.sin(a) * radius
        for (let i = 0; i < 3; i += 1) pts[k * 3 + i] = c[i] + u[i] * cs + v[i] * sn
    }
    return { pts, closed: true }
}
const polyline = (list, closed = false) => ({ pts: Float64Array.from(list.flat()), closed })

/**
 * Segments (flat xyz pairs) -> polylines that share endpoints, once, in object space. Walks from odd-degree
 * vertices first, so open chains are not split. Pure.
 */
export const chainSegments = (positions) => {
    const ids = new Map()
    const verts = []
    const idOf = (o) => {
        const key = `${Math.round(positions[o] * 1e5)},${Math.round(positions[o + 1] * 1e5)},${Math.round(positions[o + 2] * 1e5)}`
        let id = ids.get(key)
        if (id === undefined) { id = verts.length; ids.set(key, id); verts.push([positions[o], positions[o + 1], positions[o + 2]]) }
        return id
    }
    const segs = []
    const seen = new Set()
    for (let o = 0; o + 5 < positions.length; o += 6) {
        const a = idOf(o)
        const b = idOf(o + 3)
        if (a === b) continue
        const key = a < b ? `${a}-${b}` : `${b}-${a}`
        if (seen.has(key)) continue
        seen.add(key)
        segs.push([a, b])
    }
    const adj = verts.map(() => [])
    segs.forEach(([a, b], i) => { adj[a].push(i); adj[b].push(i) })
    const used = new Uint8Array(segs.length)
    const paths = []
    const starts = [...adj.keys()].sort((x, y) => (adj[y].length % 2) - (adj[x].length % 2))
    for (const s of starts) {
        for (;;) {
            if (!adj[s].some((i) => !used[i])) break
            const chain = [s]
            let at = s
            for (;;) {
                const next = adj[at].find((i) => !used[i])
                if (next === undefined) break
                used[next] = 1
                at = segs[next][0] === at ? segs[next][1] : segs[next][0]
                chain.push(at)
            }
            const closed = chain.length > 3 && chain[0] === chain[chain.length - 1]
            if (closed) chain.pop()
            paths.push(polyline(chain.map((id) => verts[id]), closed))
        }
    }
    return paths
}

const outlineStatic = (shape) => {
    const [a, b, c] = shape.dims
    switch (shape.kind) {
        case 'box': {
            const [x, y, z] = [a / 2, b / 2, c / 2]
            const sq = (yy) => [[-x, yy, -z], [x, yy, -z], [x, yy, z], [-x, yy, z]]
            const lo = sq(-y)
            const hi = sq(y)
            return [polyline(lo, true), polyline(hi, true), ...lo.map((p, i) => polyline([p, hi[i]]))]
        }
        case 'plane': return [polyline([[-a / 2, -b / 2, 0], [a / 2, -b / 2, 0], [a / 2, b / 2, 0], [-a / 2, b / 2, 0]], true)]
        case 'circle': return [ring([0, 0, 0], [1, 0, 0], [0, 1, 0], a, CIRCLE_SEGMENTS)]
        case 'cylinder': return [
            ring([0, -b / 2, 0], [1, 0, 0], [0, 0, 1], a, CYLINDER_RADIAL_SEGMENTS),
            ring([0, b / 2, 0], [1, 0, 0], [0, 0, 1], a, CYLINDER_RADIAL_SEGMENTS),
        ]
        case 'cone': return [ring([0, -b / 2, 0], [1, 0, 0], [0, 0, 1], a, CONE_RADIAL_SEGMENTS)]
        case 'torus': {
            const out = [
                ring([0, 0, 0], [1, 0, 0], [0, 1, 0], a + b, TORUS_TUBULAR_SEGMENTS),
                ring([0, 0, 0], [1, 0, 0], [0, 1, 0], a - b > 0.0005 ? a - b : 0.0005, TORUS_TUBULAR_SEGMENTS),
            ]
            for (let k = 0; k < TORUS_MERIDIANS; k += 1) {
                const t = (2 * Math.PI * k) / TORUS_MERIDIANS
                const radial = [Math.cos(t), Math.sin(t), 0]
                out.push(ring([radial[0] * a, radial[1] * a, 0], radial, [0, 0, 1], b, TORUS_RADIAL_SEGMENTS))
            }
            return out
        }
        default: return []
    }
}

const normalise = (v) => {
    const l = Math.hypot(v[0], v[1], v[2])
    return l > 1e-12 ? [v[0] / l, v[1] / l, v[2] / l] : null
}
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
const basisAround = (n) => {
    const helper = Math.abs(n[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0]
    const u = normalise(cross(helper, n))
    return [u, cross(n, u)]
}

/**
 * The view-dependent outline of a piece, in its own space: sphere silhouette ring, cylinder and cone
 * silhouette sides. `look` is { dir } (orthographic, the direction of sight) or { eye } (a point). Pure.
 */
export const outlineSilhouette = (shape, look) => {
    const [a, b] = shape.dims || []
    if (shape.kind === 'sphere') {
        if (look.dir) {
            const n = normalise(look.dir)
            if (!n) return []
            const [u, v] = basisAround(n)
            return [ring([0, 0, 0], u, v, a, SPHERE_WIDTH_SEGMENTS)]
        }
        const d = Math.hypot(...look.eye)
        if (d <= a * 1.0001) return []
        const n = look.eye.map((x) => x / d)
        const [u, v] = basisAround(n)
        const off = (a * a) / d
        return [ring(n.map((x) => x * off), u, v, a * Math.sqrt(1 - (a * a) / (d * d)), SPHERE_WIDTH_SEGMENTS)]
    }
    if (shape.kind !== 'cylinder' && shape.kind !== 'cone') return []
    let rho
    let phi
    let c
    if (look.dir) {
        const [dx, dy, dz] = look.dir
        rho = Math.hypot(dx, dz)
        phi = Math.atan2(dz, dx)
        if (rho < 1e-9) return []
        c = shape.kind === 'cylinder' ? 0 : (-a * dy) / (b * rho)
    } else {
        const [ex, ey, ez] = look.eye
        rho = Math.hypot(ex, ez)
        phi = Math.atan2(ez, ex)
        if (rho < 1e-9) return []
        c = shape.kind === 'cylinder' ? a / rho : (a * (b / 2 - ey)) / (b * rho)
    }
    if (Math.abs(c) > 1) return []
    const spread = Math.acos(c)
    return [phi - spread, phi + spread].map((t) => {
        const foot = [a * Math.cos(t), -b / 2, a * Math.sin(t)]
        const top = shape.kind === 'cylinder' ? [foot[0], b / 2, foot[2]] : [0, b / 2, 0]
        return polyline([foot, top])
    })
}

const cache = new Map()
export const clearTraceCache = () => cache.clear()
export const traceCacheSize = () => cache.size

/** A piece's static object-space paths for a mode, built once and cached. Pure apart from the cache. */
export const objectPaths = (shape, mode, angle = DEFAULT_ANGLE) => {
    if (shape.kind === 'line') {
        return mode === 'points' ? [polyline([shape.from]), polyline([shape.to])] : [polyline([shape.from, shape.to])]
    }
    const key = `${mode}|${shape.kind}|${shape.dims.join(',')}|${mode === 'edges' ? angle : ''}`
    const hit = cache.get(key)
    if (hit) return hit
    let paths
    if (mode === 'outline') {
        paths = outlineStatic(shape)
    } else {
        const mesh = meshOf(shape)
        if (mode === 'points') {
            const pos = mesh.attributes.position.array
            const seen = new Set()
            paths = []
            for (let o = 0; o < pos.length && paths.length < MAX_DOTS_PER_PIECE; o += 3) {
                const k = `${Math.round(pos[o] * 1e5)},${Math.round(pos[o + 1] * 1e5)},${Math.round(pos[o + 2] * 1e5)}`
                if (seen.has(k)) continue
                seen.add(k)
                paths.push(polyline([[pos[o], pos[o + 1], pos[o + 2]]]))
            }
        } else {
            const lines = mode === 'edges' ? new EdgesGeometry(mesh, angle) : new WireframeGeometry(mesh)
            const pos = lines.attributes.position.array
            paths = chainSegments(pos.subarray(0, Math.min(pos.length, MAX_SEGMENTS_PER_PIECE * 6)))
            lines.dispose()
        }
        mesh.dispose()
    }
    if (cache.size >= CACHE_MAX) cache.clear()
    cache.set(key, paths)
    return paths
}

/** '#rgb', '#rrggbb', or [r, g, b] (0…1, or 0…255 when any is over 1) -> [r, g, b] 0…1; null if unreadable. */
export const colourOf = (value) => {
    if (Array.isArray(value) && value.length >= 3) {
        const v = value.slice(0, 3).map((x) => finite(x, Number.NaN))
        if (v.some(Number.isNaN)) return null
        const scale = v.some((x) => x > 1) ? 255 : 1
        return v.map((x) => Math.min(1, Math.max(0, x / scale)))
    }
    if (typeof value !== 'string') return null
    let hex = value.trim().replace(/^#/, '')
    if (/^[0-9a-f]{3}$/i.test(hex)) hex = hex.split('').map((ch) => ch + ch).join('')
    if (!/^[0-9a-f]{6}/i.test(hex)) return null
    return [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
}

/** The pieces of a descriptor with their world matrices — the viewport's walk. Pure. */
export const walkPieces = (descriptor) => {
    const out = []
    const pruned = pruneGeometryDescriptor(descriptor)
    if (!pruned) return out
    const q = new Quaternion()
    const walk = (node, parent) => {
        if (node.kind === 'group') {
            const local = new Matrix4().compose(
                new Vector3(...vec3(node.position, [0, 0, 0])),
                q.clone().setFromEuler(new Euler(...vec3(node.rotation, [0, 0, 0]), 'XYZ')),
                new Vector3(...posVec3(node.scale, [1, 1, 1], 20)),
            )
            const m = parent.clone().multiply(local)
            for (const child of node.children) walk(child, m)
            return
        }
        const shape = pieceShape(node)
        if (!shape) return
        if (shape.kind === 'line') { out.push({ shape, matrix: parent }); return }
        const place = new Matrix4().compose(
            new Vector3(...vec3(node.position, [0, 0, 0])),
            q.clone().setFromEuler(new Euler(...vec3(node.rotation, [0, 0, 0]), 'XYZ')),
            new Vector3(1, 1, 1),
        ).multiply(new Matrix4().makeTranslation(0, shape.lift, 0))
        out.push({ shape, matrix: parent.clone().multiply(place) })
    }
    walk(pruned, new Matrix4())
    return out
}

const boundOf = (shape) => {
    const [a, b, c] = shape.dims || []
    switch (shape.kind) {
        case 'box': return Math.hypot(a, b, c) / 2
        case 'plane': return Math.hypot(a, b) / 2
        case 'cylinder': case 'cone': return Math.hypot(a, b / 2)
        case 'torus': return a + b
        default: return a
    }
}

/** Front view, auto size: field units per metre so every piece's bounding sphere, about the world origin, fills FIT_FRACTION. */
export const fitScale = (pieces) => {
    let reach = 0
    const v = new Vector3()
    for (const { shape, matrix } of pieces) {
        if (shape.kind === 'line') {
            for (const p of [shape.from, shape.to]) reach = Math.max(reach, v.set(...p).applyMatrix4(matrix).length())
            continue
        }
        const centre = v.set(0, 0, 0).applyMatrix4(matrix).length()
        reach = Math.max(reach, centre + boundOf(shape) * matrix.getMaxScaleOnAxis())
    }
    return reach > 1e-9 ? FIT_FRACTION / reach : 1
}

// Liang–Barsky against the field square [-1, 1]². Returns [t0, t1] or null.
const clipField = (x0, y0, x1, y1) => {
    let t0 = 0
    let t1 = 1
    const dx = x1 - x0
    const dy = y1 - y0
    const edges = [[-dx, x0 + 1], [dx, 1 - x0], [-dy, y0 + 1], [dy, 1 - y0]]
    for (const [p, q] of edges) {
        if (p === 0) { if (q < 0) return null; continue }
        const r = q / p
        if (p < 0) { if (r > t1) return null; if (r > t0) t0 = r } else { if (r < t0) return null; if (r < t1) t1 = r }
    }
    return [t0, t1]
}

/** A camera for the point view: eye `position`, looking at `aim`; y up. Pure. */
export const pointCamera = (position, aim) => {
    const eye = vec3(position, [0, 0, 6])
    const target = vec3(aim, [0, 0, 0])
    const fwd = normalise([target[0] - eye[0], target[1] - eye[1], target[2] - eye[2]]) || [0, 0, -1]
    const right = normalise(cross(fwd, [0, 1, 0])) || normalise(cross(fwd, [0, 0, -1]))
    const up = cross(right, fwd)
    return { eye, fwd, right, up }
}

/**
 * Project one path of world-space points into field paths, clipped (never clamped). `view` is
 * { kind: 'front', scale } or { kind: 'point', camera, half } (half-field in radians). Pure.
 * @returns {{ p: number[], closed: boolean }[]}
 */
export const projectPath = (world, closed, view, rgb) => {
    const n = world.length / 3
    const out = []
    const cam = (i) => {
        const x = world[i * 3]
        const y = world[i * 3 + 1]
        const z = world[i * 3 + 2]
        if (view.kind === 'front') return [x * view.scale, y * view.scale, 1]
        const { eye, fwd, right, up } = view.camera
        const d = [x - eye[0], y - eye[1], z - eye[2]]
        return [d[0] * right[0] + d[1] * right[1] + d[2] * right[2], d[0] * up[0] + d[1] * up[1] + d[2] * up[2], d[0] * fwd[0] + d[1] * fwd[1] + d[2] * fwd[2]]
    }
    const toField = (c) => (view.kind === 'front' ? [c[0], c[1]] : [Math.atan2(c[0], c[2]) / view.half, Math.atan2(c[1], c[2]) / view.half])
    const push = (path, f) => path.p.push(f[0], f[1], rgb[0], rgb[1], rgb[2])
    if (n === 1) {
        const c = cam(0)
        if (c[2] < NEAR) return out
        const f = toField(c)
        if (Math.abs(f[0]) <= 1 && Math.abs(f[1]) <= 1) { const path = { p: [], closed: false }; push(path, f); out.push(path) }
        return out
    }
    let current = null
    let cut = false
    const segCount = closed ? n : n - 1
    for (let s = 0; s < segCount; s += 1) {
        let a = cam(s)
        let b = cam((s + 1) % n)
        let nearCutA = false
        if (a[2] < NEAR && b[2] < NEAR) { current = null; cut = true; continue }
        if (a[2] < NEAR || b[2] < NEAR) {
            const t = (NEAR - a[2]) / (b[2] - a[2])
            const m = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, NEAR]
            if (a[2] < NEAR) { a = m; nearCutA = true } else b = m
            cut = true
        }
        const fa = toField(a)
        const fb = toField(b)
        const clip = clipField(fa[0], fa[1], fb[0], fb[1])
        if (!clip) { current = null; cut = true; continue }
        const [t0, t1] = clip
        const pa = [fa[0] + (fb[0] - fa[0]) * t0, fa[1] + (fb[1] - fa[1]) * t0]
        const pb = [fa[0] + (fb[0] - fa[0]) * t1, fa[1] + (fb[1] - fa[1]) * t1]
        if (t0 > 0 || t1 < 1) cut = true
        if (!current || t0 > 0 || nearCutA) {
            current = { p: [], closed: false }
            out.push(current)
            push(current, pa)
        }
        push(current, pb)
        if (t1 < 1 || b[2] === NEAR) current = null
    }
    if (closed && !cut && out.length === 1 && out[0].p.length >= 20) {
        out[0].p.length -= 5
        out[0].closed = true
    }
    return out.filter((path) => {
        let length = 0
        for (let i = 5; i < path.p.length; i += 5) length += Math.hypot(path.p[i] - path.p[i - 5], path.p[i + 1] - path.p[i - 4])
        if (path.closed) length += Math.hypot(path.p[0] - path.p[path.p.length - 5], path.p[1] - path.p[path.p.length - 4])
        return length >= MIN_PATH_LENGTH
    })
}

const now = () => (typeof globalThis.performance?.now === 'function' ? globalThis.performance.now() : Date.now())

/**
 * The whole trace. Options: mode ('outline'), view ('front'), size (front: field units per metre;
 * 0 = fit), position / aim (point view), angle (edges, degrees), colour (override), level (0…1).
 * @returns {{ frame: object, stats: { pieces, paths, points, ms } }}
 */
export const traceGeometry = (descriptor, options = {}) => {
    const started = now()
    const mode = TRACE_MODES.includes(options.mode) ? options.mode : 'outline'
    const viewKind = TRACE_VIEWS.includes(options.view) ? options.view : 'front'
    const level = Math.min(1, Math.max(0, finite(options.level, 1)))
    const angle = Math.min(180, Math.max(0, finite(options.angle, DEFAULT_ANGLE)))
    const override = colourOf(options.colour)
    const pieces = walkPieces(descriptor)
    let view
    if (viewKind === 'front') {
        const size = finite(options.size, 0)
        view = { kind: 'front', scale: size > 0 ? size : fitScale(pieces) }
    } else {
        view = { kind: 'point', camera: pointCamera(options.position, options.aim), half: (FIELD_HALF_DEG * Math.PI) / 180 }
    }
    const paths = []
    const inverse = new Matrix4()
    const tmp = new Vector3()
    for (const { shape, matrix } of pieces) {
        const base = override || colourOf(shape.colour) || [1, 1, 1]
        const rgb = base.map((x) => x * level)
        if (rgb[0] + rgb[1] + rgb[2] <= 0) continue
        const list = objectPaths(shape, mode, angle)
        let dynamic = []
        if (mode === 'outline' && (shape.kind === 'sphere' || shape.kind === 'cylinder' || shape.kind === 'cone')) {
            inverse.copy(matrix).invert()
            if (view.kind === 'front') {
                // A world direction maps into the piece by the inverse of its linear part.
                const o = tmp.set(0, 0, 0).applyMatrix4(inverse).toArray()
                const t = tmp.set(0, 0, -1).applyMatrix4(inverse).toArray()
                dynamic = outlineSilhouette(shape, { dir: [t[0] - o[0], t[1] - o[1], t[2] - o[2]] })
            } else {
                dynamic = outlineSilhouette(shape, { eye: tmp.set(...view.camera.eye).applyMatrix4(inverse).toArray() })
            }
        }
        const e = matrix.elements
        for (const { pts, closed } of list.concat(dynamic)) {
            const world = new Float64Array(pts.length)
            for (let i = 0; i < pts.length; i += 3) {
                const x = pts[i]
                const y = pts[i + 1]
                const z = pts[i + 2]
                world[i] = e[0] * x + e[4] * y + e[8] * z + e[12]
                world[i + 1] = e[1] * x + e[5] * y + e[9] * z + e[13]
                world[i + 2] = e[2] * x + e[6] * y + e[10] * z + e[14]
            }
            for (const path of projectPath(world, closed, view, rgb)) paths.push(path)
        }
    }
    const ms = Math.round((now() - started) * 1000) / 1000
    const points = paths.reduce((s, p) => s + p.p.length / 5, 0)
    return {
        frame: { kind: 'laser', v: FRAME_VERSION, paths, order: 'free', source: 'trace', ms },
        stats: { pieces: pieces.length, paths: paths.length, points, ms },
    }
}
