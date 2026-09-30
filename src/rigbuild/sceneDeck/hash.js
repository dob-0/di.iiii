// THE SCENE DECK — the canonical form of a scene and its content hash (docs/architecture/RIG_BUILD.md §21).
//
// A scene's hash is SHA-256 (FIPS 180-4) over a canonical JSON of the scene's OWN content: its name, its
// place in the loop (fade, hold), its look's id and data, and the cue's key and surfaces. Keys are sorted,
// numbers are rounded to 6 decimals (-0 is 0), and nothing else is read: no scene id, no other scene, no
// timestamp, no documentVersion — those are per-install counters and can never say which copy is newer.
// Pure and synchronous: the same code runs in a browser and in node (no crypto.subtle, no Buffer).
// No hash util in the repo fits: contentAddressedAsset.js checks ids the SERVER hashed; this one is local.
import { SceneDeckError } from './errors.js'

const K = new Uint32Array([
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
])
const rotr = (x, n) => (x >>> n) | (x << (32 - n))

/** SHA-256 of a string's UTF-8 bytes, as 64 hex digits. */
export const sha256Hex = (text) => {
    const bytes = new TextEncoder().encode(String(text))
    const padded = new Uint8Array(((bytes.length + 9 + 63) >> 6) << 6)
    padded.set(bytes)
    padded[bytes.length] = 0x80
    const view = new DataView(padded.buffer)
    const bits = bytes.length * 8
    view.setUint32(padded.length - 8, Math.floor(bits / 0x100000000))
    view.setUint32(padded.length - 4, bits >>> 0)
    const H = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19])
    const W = new Uint32Array(64)
    for (let off = 0; off < padded.length; off += 64) {
        for (let i = 0; i < 16; i += 1) W[i] = view.getUint32(off + i * 4)
        for (let i = 16; i < 64; i += 1) {
            const s0 = rotr(W[i - 15], 7) ^ rotr(W[i - 15], 18) ^ (W[i - 15] >>> 3)
            const s1 = rotr(W[i - 2], 17) ^ rotr(W[i - 2], 19) ^ (W[i - 2] >>> 10)
            W[i] = (W[i - 16] + s0 + W[i - 7] + s1) >>> 0
        }
        let [a, b, c, d, e, f, g, h] = H
        for (let i = 0; i < 64; i += 1) {
            const t1 = (h + (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) + ((e & f) ^ (~e & g)) + K[i] + W[i]) >>> 0
            const t2 = ((rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) >>> 0
            h = g
            g = f
            f = e
            e = (d + t1) >>> 0
            d = c
            c = b
            b = a
            a = (t1 + t2) >>> 0
        }
        H[0] += a
        H[1] += b
        H[2] += c
        H[3] += d
        H[4] += e
        H[5] += f
        H[6] += g
        H[7] += h
    }
    return Array.from(H, (x) => x.toString(16).padStart(8, '0')).join('')
}

/** A number as the hash sees it: finite, 6 decimals, never -0. */
export const normaliseNumber = (n) => {
    if (!Number.isFinite(n)) throw new SceneDeckError('non-finite', `a scene cannot hold ${n}`)
    const r = Math.round(n * 1e6) / 1e6
    return Object.is(r, -0) ? 0 : r
}

/** JSON with sorted keys and normalised numbers: one text per content, whatever the key order. */
export const canonicalJson = (value) => {
    if (value === null) return 'null'
    if (typeof value === 'number') return JSON.stringify(normaliseNumber(value))
    if (typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value)
    if (Array.isArray(value)) return `[${value.map((v) => (v === undefined ? 'null' : canonicalJson(v))).join(',')}]`
    if (typeof value === 'object') {
        return `{${Object.keys(value).filter((k) => value[k] !== undefined).sort().map((k) => `${JSON.stringify(k)}:${canonicalJson(value[k])}`).join(',')}}`
    }
    throw new SceneDeckError('bad-value', `a scene cannot hold a ${typeof value}`)
}

const clone = (v) => JSON.parse(JSON.stringify(v ?? {}))

/** A look's level per group, for every group it names; absent = full (normalizeRigLooks, RIG_BUILD §11.4). */
export const effectiveLevels = (look = {}) => {
    const keys = new Set([...Object.keys(look?.aims || {}), ...Object.keys(look?.colours || {}), ...Object.keys(look?.levels || {})])
    return Object.fromEntries([...keys].sort().map((k) => [k, Number.isFinite(look?.levels?.[k]) ? look.levels[k] : 1]))
}

/** The scene's own content — what is hashed, carried in a bundle and applied from the other copy. Idempotent. */
export const sceneContent = (scene) => ({
    name: String(scene?.name || ''),
    inLoop: Boolean(scene?.inLoop),
    fade: scene?.inLoop ? Number(scene.fade) : null,
    hold: scene?.inLoop ? Number(scene.hold) : null,
    lookId: String(scene?.lookId || ''),
    look: {
        title: String(scene?.look?.title || ''),
        intent: String(scene?.look?.intent || ''),
        aims: clone(scene?.look?.aims),
        colours: clone(scene?.look?.colours),
        levels: effectiveLevels(scene?.look)
    },
    cue: scene?.inLoop ? { key: String(scene?.cue?.key || ''), surfaces: clone(scene?.cue?.surfaces) } : null
})

/** The scene's content hash (64 hex digits). */
export const sceneHash = (scene) => sha256Hex(canonicalJson(sceneContent(scene)))
