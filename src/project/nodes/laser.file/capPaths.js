// Holds a set of frame v2 paths within a vertex cap (FRAME_MAX_POINTS by default), for the import nodes
// (Laser File, Laser Text). Pure.
import { FRAME_MAX_POINTS } from '../../../shared/laserFrame.js'

const lengthOf = (p) => {
    let l = 0
    for (let i = 5; i < p.length; i += 5) l += Math.hypot(p[i] - p[i - 5], p[i + 1] - p[i - 4])
    return l
}

/**
 * Paths -> { paths, cutPoints, cutPaths } with at most `max` vertices in all. Under the cap the paths are
 * returned as they are. Over it, every path keeps its two ends and an even share (by index) of its inner
 * vertices, rounded by largest remainder, so the sum is `max` and never passes it; if even two vertices a
 * path will not fit, the longest paths are kept and the rest counted in `cutPaths`. A closed path cut below
 * 3 vertices is open. Pure.
 */
export const capPaths = (paths, max = FRAME_MAX_POINTS) => {
    const cap = Math.max(2, Math.floor(max))
    let list = (paths || []).filter((path) => Array.isArray(path?.p) && path.p.length >= 5)
    const total = list.reduce((s, path) => s + path.p.length / 5, 0)
    if (total <= cap) return { paths: list, cutPoints: 0, cutPaths: 0 }
    let cutPaths = 0
    if (list.length * 2 > cap) {
        const keep = Math.floor(cap / 2)
        const order = list.map((path, i) => [lengthOf(path.p), i]).sort((a, b) => b[0] - a[0] || a[1] - b[1]).slice(0, keep).map((e) => e[1]).sort((a, b) => a - b)
        cutPaths = list.length - order.length
        list = order.map((i) => list[i])
    }
    const counts = list.map((path) => path.p.length / 5)
    const fixed = counts.reduce((s, n) => s + Math.min(n, 2), 0)
    const inner = counts.reduce((s, n) => s + Math.max(0, n - 2), 0)
    const ratio = inner > 0 ? Math.max(0, cap - fixed) / inner : 0
    // Largest remainder: the vertices the rounding down leaves over go, one each, to the paths it cut most.
    const shares = counts.map((n) => Math.max(0, n - 2) * ratio)
    const keepInner = shares.map((s, i) => Math.min(counts[i] - 2, Math.floor(s)))
    let spare = Math.max(0, cap - fixed) - keepInner.reduce((s, k) => s + Math.max(0, k), 0)
    const byRemainder = shares.map((s, i) => [s - Math.floor(s), i]).filter(([, i]) => counts[i] > 2).sort((a, b) => b[0] - a[0] || a[1] - b[1])
    for (const [, i] of byRemainder) {
        if (spare <= 0) break
        if (keepInner[i] < counts[i] - 2) { keepInner[i] += 1; spare -= 1 }
    }
    const out = list.map((path, i) => {
        const n = counts[i]
        if (n <= 2) return path
        const k = 2 + keepInner[i]
        if (k >= n) return path
        const p = []
        for (let j = 0; j < k; j += 1) {
            const s = Math.round((j * (n - 1)) / (k - 1)) * 5
            p.push(path.p[s], path.p[s + 1], path.p[s + 2], path.p[s + 3], path.p[s + 4])
        }
        return { p, closed: Boolean(path.closed) && k >= 3 }
    })
    const kept = out.reduce((s, path) => s + path.p.length / 5, 0)
    return { paths: out, cutPoints: total - kept, cutPaths }
}
