// Scale a GLB to a measured real-world size (metres). glTF is Y-up, metre units.
// Method: world AABB from POSITION accessor min/max through the node transforms (exact for the box of the
// accessor bounds, a slight over-estimate for rotated parts), uniform scale, then re-seat on the floor
// (min Y = 0, centred in X/Z) by wrapping the scene roots in one new node. Vertex data is not touched.
import fs from 'node:fs'

export function readGlb(buf) {
    if (buf.readUInt32LE(0) !== 0x46546c67) throw new Error('not a GLB (bad magic)')
    let off = 12, json = null, bin = null
    while (off < buf.length) {
        const len = buf.readUInt32LE(off), type = buf.readUInt32LE(off + 4)
        const data = buf.subarray(off + 8, off + 8 + len)
        if (type === 0x4e4f534a) json = JSON.parse(data.toString('utf8'))
        else if (type === 0x004e4942) bin = data
        off += 8 + len
    }
    if (!json) throw new Error('GLB has no JSON chunk')
    return { json, bin }
}

export function writeGlb(json, bin) {
    const pad = (b, fill) => { const n = (4 - (b.length % 4)) % 4; return n ? Buffer.concat([b, Buffer.alloc(n, fill)]) : b }
    const j = pad(Buffer.from(JSON.stringify(json), 'utf8'), 0x20)
    const parts = [j]
    const head = Buffer.alloc(12)
    head.writeUInt32LE(0x46546c67, 0); head.writeUInt32LE(2, 4)
    const chunk = (len, type) => { const h = Buffer.alloc(8); h.writeUInt32LE(len, 0); h.writeUInt32LE(type, 4); return h }
    const out = [head, chunk(j.length, 0x4e4f534a), j]
    if (bin) { const b = pad(bin, 0); out.push(chunk(b.length, 0x004e4942), b) }
    const buf = Buffer.concat(out)
    buf.writeUInt32LE(buf.length, 8)
    return buf
}

const I = () => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1] // column-major
function mul(a, b) { const o = new Array(16).fill(0); for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) o[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k]; return o }
function trs(n) {
    if (n.matrix) return n.matrix
    const [x, y, z, w] = n.rotation || [0, 0, 0, 1], [sx, sy, sz] = n.scale || [1, 1, 1], [tx, ty, tz] = n.translation || [0, 0, 0]
    return [
        (1 - 2 * (y * y + z * z)) * sx, 2 * (x * y + z * w) * sx, 2 * (x * z - y * w) * sx, 0,
        2 * (x * y - z * w) * sy, (1 - 2 * (x * x + z * z)) * sy, 2 * (y * z + x * w) * sy, 0,
        2 * (x * z + y * w) * sz, 2 * (y * z - x * w) * sz, (1 - 2 * (x * x + y * y)) * sz, 0,
        tx, ty, tz, 1]
}

export function worldBounds(json) {
    const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity]
    const scene = json.scenes?.[json.scene ?? 0]
    if (!scene) throw new Error('GLB has no scene')
    const visit = (i, parent) => {
        const n = json.nodes[i], m = mul(parent, trs(n))
        if (n.mesh !== undefined) {
            for (const p of json.meshes[n.mesh].primitives) {
                const a = json.accessors[p.attributes.POSITION]
                if (!a?.min || !a?.max) throw new Error('POSITION accessor has no min/max')
                for (let c = 0; c < 8; c++) {
                    const v = [c & 1 ? a.max[0] : a.min[0], c & 2 ? a.max[1] : a.min[1], c & 4 ? a.max[2] : a.min[2]]
                    for (let ax = 0; ax < 3; ax++) {
                        const w = m[ax] * v[0] + m[4 + ax] * v[1] + m[8 + ax] * v[2] + m[12 + ax]
                        if (w < min[ax]) min[ax] = w
                        if (w > max[ax]) max[ax] = w
                    }
                }
            }
        }
        for (const c of n.children || []) visit(c, m)
    }
    for (const r of scene.nodes) visit(r, I())
    if (!isFinite(min[0])) throw new Error('GLB has no mesh geometry')
    return { min, max, extent: max.map((v, i) => v - min[i]) }
}

// target: {height} (metres, Y extent) or {size:[w,h,d]} metres (X,Y,Z extents). Uniform scale.
// With a box, the scale is the smallest ratio so the object fits inside the measured box; residual per axis is reported.
export function computeScale(extent, target) {
    if (target.height != null) {
        if (!(target.height > 0)) throw new Error('height must be > 0 metres')
        return { scale: target.height / extent[1], basis: 'height' }
    }
    if (target.size) {
        if (target.size.length !== 3 || !target.size.every(v => v > 0)) throw new Error('size needs three positive metres: W,H,D')
        const ratios = target.size.map((t, i) => t / extent[i])
        return { scale: Math.min(...ratios), basis: 'box-fit (min ratio)' }
    }
    throw new Error('target needs height or size')
}

export function scaleGlb(inFile, outFile, target) {
    const { json, bin } = readGlb(fs.readFileSync(inFile))
    const before = worldBounds(json)
    const { scale, basis } = computeScale(before.extent, target)
    const scene = json.scenes[json.scene ?? 0]
    const cx = (before.min[0] + before.max[0]) / 2, cz = (before.min[2] + before.max[2]) / 2
    json.nodes.push({ name: 'gen3d_scaled_root', children: [...scene.nodes], scale: [scale, scale, scale], translation: [-cx * scale, -before.min[1] * scale, -cz * scale] })
    scene.nodes = [json.nodes.length - 1]
    const after = worldBounds(json)
    fs.writeFileSync(outFile, writeGlb(json, bin))
    const residual = target.size ? after.extent.map((v, i) => +(v / target.size[i]).toFixed(3)) : null
    return {
        basis, scale: +scale.toFixed(6), before_extent_m: before.extent.map(v => +v.toFixed(4)), after_extent_m: after.extent.map(v => +v.toFixed(4)),
        target, residual_vs_target: residual, seated: 'min Y = 0, centred X/Z',
        note: 'Single-image models give arbitrary scale and invent unseen sides; this fixes size only, not shape fidelity.'
    }
}
