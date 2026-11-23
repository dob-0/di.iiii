// Which labels of the 3D Monitor map can be shown without covering each other, and the overlap count the
// check script and the tests report. Pure: screen rectangles in, rectangles out.
import { cameraAt, presetPose, S, toScreen } from './monitorMapCamera.js'

// card sizes in stage pixels (preferences.css .monitor-card3d: compact one-line label, full card on hover/select)
export const LABEL_H = 26
export const FULL = { w: 156, h: 64 }
export const labelWidth = (text) => Math.min(220, Math.round(String(text || '').length * 7 + 30))
export const GAP = 2

// who gets a label first when two would cover each other
const PRIORITY = { hub: 0, tier: 1, machine: 2, agent: 3, show: 4, space: 5, repo: 6 }

const hit = (a, b) => a.x < b.x + b.w + GAP && b.x < a.x + a.w + GAP && a.y < b.y + b.h + GAP && b.y < a.y + a.h + GAP
export const rectOf = (cx, cy, w, h) => ({ x: cx - w / 2, y: cy - h / 2, w, h })
/** A node card hangs from its anchor: bottom edge on the point, centred across (MonitorMap3D CARD_ANCHOR). */
export const LABEL_LIFT = 0.3
export const hangOf = (cx, cy, w, h) => ({ x: cx - w / 2, y: cy - h, w, h })
const boxOf = (it, w, h) => (it.kind === 'hub' ? rectOf : hangOf)(it.sx, it.sy, w, h)
/** The full card keeps the name on one line, so it is never narrower than its label. */
export const fullWidth = (text) => Math.max(FULL.w, labelWidth(text) + 16)

/** Overlapping pairs in a list of {id, x, y, w, h}. */
export const countOverlaps = (rects) => {
    let n = 0
    for (let i = 0; i < rects.length; i += 1) for (let j = i + 1; j < rects.length; j += 1) if (hit(rects[i], rects[j])) n += 1
    return n
}

/** Rectangles of the page's own controls inside the stage (tools top right, hint bottom left). */
export const stageBlockers = (size, { hint = true } = {}) => {
    const out = [{ id: 'tools', kind: 'button', x: size.width - 8 - 372, y: 8, w: 372, h: 44 }]
    if (hint && size.width > 600) out.push({ id: 'hint', kind: 'hint', x: 8, y: size.height - 8 - 16, w: Math.min(size.width - 16, 560), h: 16 })
    return out
}

/**
 * Greedy label plan. `items`: [{ id, kind, label, sx, sy, sz, full }] with screen anchor (sx, sy) and depth sz.
 * A full card (hover / selected) always shows and is placed first. Returns the ids that show, with an opacity,
 * and the ones left hidden (they still show on hover, selection, or when the camera comes closer).
 */
export const planLabels = (items, size, blockers = []) => {
    const placed = blockers.map((b) => ({ ...b }))
    const shown = new Map()
    const hidden = []
    const order = [...items].sort((a, b) => (b.full ? 1 : 0) - (a.full ? 1 : 0) || (PRIORITY[a.kind] ?? 9) - (PRIORITY[b.kind] ?? 9) || (a.depth ?? 0) - (b.depth ?? 0) || (a.id < b.id ? -1 : 1))
    for (const it of order) {
        const w = it.full ? fullWidth(it.label) : labelWidth(it.label)
        const h = it.full ? FULL.h : LABEL_H
        const r = { id: it.id, kind: 'label', ...boxOf(it, w, h) }
        const inside = it.sz < 1 && r.x >= 0 && r.y >= 0 && r.x + r.w <= size.width && r.y + r.h <= size.height
        if (inside && !placed.some((p) => hit(r, p))) { placed.push(r); shown.set(it.id, it.opacity ?? 1) } else if (it.full) { placed.push(r); shown.set(it.id, 1) } else hidden.push(it.id)
    }
    return { shown, hidden, rects: placed.filter((p) => p.kind === 'label') }
}

/** The old rule: tiers and machines always named, every node named once the camera is close. */
export const legacyNamed = (kind, close) => close || kind === 'tier' || kind === 'machine'

/** Screen items for a layout seen from a pose. */
export const screenItems = (layout, camera, size, fitDist = 10) => {
    const items = []
    const hub = toScreen(camera, [0, 0.5, 0], size)
    items.push({ id: '__hub', kind: 'hub', label: 'di.iiii', sx: hub.x, sy: hub.y, sz: hub.z, depth: camera.position.distanceTo({ x: 0, y: 0.5, z: 0 }) })
    for (const n of layout.nodes) {
        const p = layout.pos.get(n.id)
        const pt = [p.x * S, p.h * S + LABEL_LIFT, p.y * S]
        const s = toScreen(camera, pt, size)
        const depth = Math.hypot(camera.position.x - pt[0], camera.position.y - pt[1], camera.position.z - pt[2])
        const t = Math.min(1, Math.max(0, (depth / fitDist - 0.9) / 0.9))
        items.push({ id: n.id, kind: n.kind, label: n.label, sx: s.x, sy: s.y, sz: s.z, depth, opacity: Math.round((1 - t * 0.65) * 4) / 4 })
    }
    return items
}

/** Overlap report for one pose: the old rule against the new plan. */
export const measurePreset = (layout, name, size) => {
    const pose = presetPose(layout, name, size)
    const cam = cameraAt(pose, size)
    const items = screenItems(layout, cam, size, pose.dist)
    const rectFor = (it) => ({ id: it.id, kind: 'label', ...boxOf(it, labelWidth(it.label), LABEL_H) })
    const blockers = stageBlockers(size)
    const visible = (it) => it.sz < 1
    const oldFit = items.filter((it) => visible(it) && (it.kind === 'hub' || legacyNamed(it.kind, false)))
    const oldClose = items.filter(visible)
    const count = (list) => countOverlaps([...list.map(rectFor), ...blockers])
    const plan = planLabels(items, size, blockers)
    const after = countOverlaps([...plan.rects, ...blockers])
    return {
        preset: name,
        nodes: layout.nodes.length,
        before: { named_at_fit: oldFit.length, overlaps_at_fit: count(oldFit), named_close: oldClose.length, overlaps_close: count(oldClose) },
        after: { shown: plan.shown.size, hidden: plan.hidden.length, overlaps: after }
    }
}
