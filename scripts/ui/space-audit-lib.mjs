// Pure helpers for scripts/ui/space-audit.mjs: rectangle maths, per-component numbers, touch-target classes,
// the offender score and the Markdown table. No browser, no I/O: unit-tested in space-audit-lib.test.mjs.
// A rect is {x, y, w, h} in css px. Method: union by coordinate compression (exact for any overlap).

export const area = (r) => Math.max(0, r.w) * Math.max(0, r.h)

// The part of r that lies inside clip, or null when they do not meet.
export function clipRect(r, clip) {
    const x0 = Math.max(r.x, clip.x), y0 = Math.max(r.y, clip.y)
    const x1 = Math.min(r.x + r.w, clip.x + clip.w), y1 = Math.min(r.y + r.h, clip.y + clip.h)
    return x1 > x0 && y1 > y0 ? { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } : null
}

// Area covered by at least one rect (overlaps counted once), optionally clipped.
export function unionArea(rects, clip = null) {
    const rs = []
    for (const r of rects) { const c = clip ? clipRect(r, clip) : (area(r) > 0 ? r : null); if (c) rs.push(c) }
    if (!rs.length) return 0
    const xs = [...new Set(rs.flatMap((r) => [r.x, r.x + r.w]))].sort((a, b) => a - b)
    let total = 0
    for (let i = 0; i + 1 < xs.length; i++) {
        const xa = xs[i], xb = xs[i + 1]
        const spans = rs.filter((r) => r.x <= xa && r.x + r.w >= xb).map((r) => [r.y, r.y + r.h]).sort((a, b) => a[0] - b[0])
        let covered = 0, curEnd = -Infinity, curStart = 0
        for (const [s, e] of spans) {
            if (s > curEnd) { if (curEnd > -Infinity) covered += curEnd - curStart; curStart = s; curEnd = e } else if (e > curEnd) curEnd = e
        }
        if (curEnd > -Infinity) covered += curEnd - curStart
        total += covered * (xb - xa)
    }
    return total
}

// Share of the outer box taken by padding + border (the box minus its content box). pad/border = {t,r,b,l}.
export function paddingShare(box, pad = {}, border = {}) {
    const a = area(box)
    if (!a) return 0
    const px = (pad.l || 0) + (pad.r || 0) + (border.l || 0) + (border.r || 0)
    const py = (pad.t || 0) + (pad.b || 0) + (border.t || 0) + (border.b || 0)
    const content = Math.max(0, box.w - px) * Math.max(0, box.h - py)
    return (a - content) / a
}

// Empty area inside a container: its box minus the union of its children's boxes (clipped to it).
export function emptyArea(container, childRects) {
    return Math.max(0, area(container) - unionArea(childRects, container))
}
export function emptyShare(container, childRects) {
    const a = area(container)
    return a ? emptyArea(container, childRects) / a : 0
}

// Distinct text lines: rects whose vertical centres are closer than half the smaller height are one line.
export function countLines(textRects) {
    const rs = textRects.filter((r) => r.h > 0 && r.w > 0).sort((a, b) => a.y - b.y)
    const lines = []
    for (const r of rs) {
        const cy = r.y + r.h / 2
        const hit = lines.find((l) => Math.abs(l.cy - cy) < Math.min(l.h, r.h) / 2)
        if (hit) { hit.cy = (hit.cy + cy) / 2 } else lines.push({ cy, h: r.h })
    }
    return lines.length
}

// Touch-target thresholds (css px): WCAG 2.5.8 minimum 24 and the 44 px comfortable size for touch (WCAG 2.5.5).
export const TARGET_MIN = { fine: 24, coarse: 44 }
export const OVERSIZE_FINE = 44
export function classifyTarget(box, pointer) {
    const min = TARGET_MIN[pointer] ?? TARGET_MIN.fine
    const small = Math.min(box.w, box.h) < min
    const oversize = pointer !== 'coarse' && box.h > OVERSIZE_FINE
    return { small, oversize }
}

// Where the main view starts: px from the top to the first content of the active tab, and the share of the
// first screen that sits above it (1 = the content is not on the first screen at all).
export function mainViewStart(top, viewportH) {
    if (top == null || !Number.isFinite(top)) return { px: null, share: null, belowFold: null }
    const px = Math.round(top)
    return { px, share: Math.min(1, Math.max(0, top) / viewportH), belowFold: top >= viewportH }
}

// The group a component's waste is summed under (a class name), and the total by class over all (viewport, state) runs.
// rows: [{cls, viewport, state, wastePx2, picture}]. Score = sum of wasted px2 over every first screen it is seen on.
export function rankOffenders(rows, n = 15) {
    const by = new Map()
    for (const r of rows) {
        if (!(r.wastePx2 > 0)) continue
        const g = by.get(r.cls) || { cls: r.cls, score: 0, seen: 0, worst: null }
        g.score += r.wastePx2
        g.seen += 1
        if (!g.worst || r.wastePx2 > g.worst.wastePx2) g.worst = r
        by.set(r.cls, g)
    }
    return [...by.values()].sort((a, b) => b.score - a.score).slice(0, n)
}

export const median = (xs) => {
    if (!xs.length) return 0
    const s = [...xs].sort((a, b) => a - b), m = s.length >> 1
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

export function toMarkdownTable(headers, rows) {
    const esc = (v) => String(v ?? '').replace(/\|/g, '\\|')
    return [`| ${headers.map(esc).join(' | ')} |`, `| ${headers.map(() => '---').join(' | ')} |`, ...rows.map((r) => `| ${r.map(esc).join(' | ')} |`)].join('\n')
}
