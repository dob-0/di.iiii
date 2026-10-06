#!/usr/bin/env node
/**
 * pieces-glb.mjs — the build pieces' bodies, generated from their numbers.
 * docs/architecture/RIG_BUILD.md §2.3.
 *
 *   node scripts/rigbuild/pieces-glb.mjs          # writes scripts/rigbuild/pieces/<kind>.glb
 *   node scripts/rigbuild/pieces-glb.mjs --check  # exit 1 if a committed GLB is stale
 *
 * Every size comes from src/rigbuild/pieces.js, so a piece's body, its snap
 * points and its entry in an MVR file can never disagree. A box truss is drawn as
 * its four chords (51 mm) and the zig-zag lacing on each face (20 mm, one diagonal
 * per 0.5 m bay); a tower is the same truss standing on its base plate; a deck is
 * its slab on four legs. glTF frame: metres, Y up, the piece's own origin
 * (pieces.js). Our own geometry — AGPL-3.0-only with the repository.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Document, NodeIO } from '@gltf-transform/core'
import { PIECES, SLOT_PITCH_M, TRUSS_CHORD_M, TRUSS_SECTION_M } from '../../src/rigbuild/pieces.js'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
export const PIECES_GLB_DIR = 'scripts/rigbuild/pieces'
const LACING_M = 0.02

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
const scale = (v, k) => [v[0] * k, v[1] * k, v[2] * k]
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
const unit = (v) => {
    const l = Math.hypot(...v) || 1
    return v.map((c) => c / l)
}

// A square bar of side `t` from p0 to p1: 6 faces, flat normals.
const bar = (mesh, p0, p1, t) => {
    const axis = unit(sub(p1, p0))
    const helper = Math.abs(axis[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0]
    const u = scale(unit(cross(axis, helper)), t / 2)
    const v = scale(unit(cross(axis, u)), t / 2)
    const corner = (p, su, sv) => add(add(p, scale(u, su)), scale(v, sv))
    const c = [
        corner(p0, -1, -1), corner(p0, 1, -1), corner(p0, 1, 1), corner(p0, -1, 1),
        corner(p1, -1, -1), corner(p1, 1, -1), corner(p1, 1, 1), corner(p1, -1, 1)
    ]
    const quad = (a, b, cc, d) => {
        const n = unit(cross(sub(c[b], c[a]), sub(c[cc], c[a])))
        const base = mesh.positions.length / 3
        for (const i of [a, b, cc, d]) { mesh.positions.push(...c[i]); mesh.normals.push(...n) }
        mesh.indices.push(base, base + 1, base + 2, base, base + 2, base + 3)
    }
    quad(0, 3, 2, 1); quad(4, 5, 6, 7)
    quad(0, 1, 5, 4); quad(1, 2, 6, 5); quad(2, 3, 7, 6); quad(3, 0, 4, 7)
}

const box = (mesh, min, max) => {
    // an axis-aligned box as a bar along Y with a square section is not enough for a
    // slab, so: six quads directly.
    const [x0, y0, z0] = min
    const [x1, y1, z1] = max
    const faces = [
        [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, 1]],
        [[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [0, 0, -1]],
        [[x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [1, 0, 0]],
        [[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [-1, 0, 0]],
        [[x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], [0, 1, 0]],
        [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], [0, -1, 0]]
    ]
    for (const [a, b, c, d, n] of faces) {
        const base = mesh.positions.length / 3
        for (const p of [a, b, c, d]) { mesh.positions.push(...p); mesh.normals.push(...n) }
        mesh.indices.push(base, base + 1, base + 2, base, base + 2, base + 3)
    }
}

// A box truss along an axis from `from` to `to` (world), the section centred on
// that line. `across` is one of the two section directions.
const truss = (mesh, from, to, across) => {
    const axis = unit(sub(to, from))
    const a = unit(across)
    const b = unit(cross(axis, a))
    const h = (TRUSS_SECTION_M - TRUSS_CHORD_M) / 2
    const chords = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sa, sb]) => add(scale(a, sa * h), scale(b, sb * h)))
    for (const off of chords) bar(mesh, add(from, off), add(to, off), TRUSS_CHORD_M)
    const length = Math.hypot(...sub(to, from))
    const bays = Math.max(1, Math.round(length / SLOT_PITCH_M))
    for (let face = 0; face < 4; face++) {
        const p = chords[face]
        const q = chords[(face + 1) % 4]
        for (let i = 0; i < bays; i++) {
            const s0 = add(from, scale(axis, (length * i) / bays))
            const s1 = add(from, scale(axis, (length * (i + 1)) / bays))
            const [x, y] = i % 2 ? [p, q] : [q, p]
            bar(mesh, add(s0, x), add(s1, y), LACING_M)
        }
    }
}

export const pieceMesh = (piece) => {
    const mesh = { positions: [], normals: [], indices: [] }
    if (piece.category === 'truss') {
        truss(mesh, [-piece.length / 2, 0, 0], [piece.length / 2, 0, 0], [0, 1, 0])
    } else if (piece.category === 'tower') {
        const [pw, ph, pd] = piece.plate
        box(mesh, [-pw / 2, 0, -pd / 2], [pw / 2, ph, pd / 2])
        truss(mesh, [0, ph, 0], [0, piece.height, 0], [1, 0, 0])
    } else if (piece.category === 'cube') {
        box(mesh, [-0.5, 0, -0.5], [0.5, 1, 0.5])
    } else if (piece.category === 'deck') {
        const [w, h, d] = piece.size
        box(mesh, [-w / 2, h - piece.slab, -d / 2], [w / 2, h, d / 2])
        const leg = 0.06
        for (const sx of [-1, 1]) {
            for (const sz of [-1, 1]) {
                const x = sx * (w / 2 - leg)
                const z = sz * (d / 2 - leg)
                box(mesh, [x - leg / 2, 0, z - leg / 2], [x + leg / 2, h - piece.slab, z + leg / 2])
            }
        }
    }
    return mesh
}

export const pieceGlb = async (piece) => {
    const mesh = pieceMesh(piece)
    const doc = new Document()
    doc.getRoot().getAsset().generator = 'di.iiii scripts/rigbuild/pieces-glb.mjs'
    const buffer = doc.createBuffer()
    const material = doc.createMaterial(piece.category)
        // matte steel: with no environment map a metallic 0.8 truss renders near-black in a dark hall (owner, 2026-09-30)
        .setBaseColorFactor(piece.category === 'deck' ? [0.08, 0.08, 0.09, 1] : [0.72, 0.74, 0.77, 1])
        .setMetallicFactor(piece.category === 'deck' ? 0 : 0.3)
        .setRoughnessFactor(piece.category === 'deck' ? 0.9 : 0.55)
    const prim = doc.createPrimitive()
        .setAttribute('POSITION', doc.createAccessor().setType('VEC3').setArray(new Float32Array(mesh.positions)).setBuffer(buffer))
        .setAttribute('NORMAL', doc.createAccessor().setType('VEC3').setArray(new Float32Array(mesh.normals)).setBuffer(buffer))
        .setIndices(doc.createAccessor().setType('SCALAR').setArray(new Uint32Array(mesh.indices)).setBuffer(buffer))
        .setMaterial(material)
    const node = doc.createNode(piece.kind).setMesh(doc.createMesh(piece.kind).addPrimitive(prim))
    doc.createScene(piece.kind).addChild(node)
    return Buffer.from(await new NodeIO().writeBinary(doc))
}

// A unit cube, base-anchored like the room's primitives (x and z centred, y 0..1):
// what an MVR SceneObject scales to a box the rig drew before pieces existed.
export const cubeGlb = async () => pieceGlb({ kind: 'cube', category: 'cube', size: [1, 1, 1] })

const main = async () => {
    const check = process.argv.includes('--check')
    let stale = 0
    for (const piece of Object.values(PIECES)) {
        const bytes = await pieceGlb(piece)
        const file = path.join(ROOT, PIECES_GLB_DIR, `${piece.kind}.glb`)
        if (check) {
            const now = fs.existsSync(file) ? fs.readFileSync(file) : Buffer.alloc(0)
            if (!now.equals(bytes)) { console.error(`${piece.kind}.glb is stale`); stale++ }
            continue
        }
        fs.mkdirSync(path.dirname(file), { recursive: true })
        fs.writeFileSync(file, bytes)
        console.log(`${PIECES_GLB_DIR}/${piece.kind}.glb  ${bytes.length} bytes  ${pieceMesh(piece).indices.length / 3} triangles`)
    }
    if (stale) process.exit(1)
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main()
