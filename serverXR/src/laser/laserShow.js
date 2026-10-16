// THE SHOW ON THE CUBES (2026-10-17) — a project's laser lines, played on the real LaserCubes.
//
// The room draws a laser line's `frames` ({ period, list }) by SHOW TIME: list[floor(((t mod period) / period) · n)],
// t the server's clock in seconds (src/objectComponents/laserLine.js §6; SpotLightObject.jsx useLaserFrameIndex). Until
// now that drawing reached the room only. This player gives the same frames to the cubes the engine drives: at every
// tick it reads the clock, picks each line's frame, joins the lines of one cube into one drawing, keeps it in the engine
// (setFrame) when it changes and keeps it alive (alive) in between. Nothing of the engine's safety moves: the zone, the
// guards and the arming are the engine's as before — a cube that is not armed takes the frame and emits nothing, and
// the sign-off phrase stays a person's to type.
//
// Which lines are one cube: the rig builder (scripts/place/rig.mjs) names a cube's lines <group><letters>
// (rig-laser-1a … rig-laser-1f = one cube), so a line's group is its id without the trailing letters; a line whose id
// ends otherwise is a group of its own. Which real cube plays which group: `map` { cubeId: groupId }; by default the
// cubes and the groups in sorted order, side by side (cube-1 ↔ rig-laser-1 …). A frame the schema dropped is not drawn,
// exactly as in the room. The player holds its cubes as the Laser Out `show:<project>` (one Out per cube, laserEngine.js):
// a Nodes editor's Out on the same cube refuses it, and the state says so per cube.
'use strict'

const { normaliseFramePoints } = require('../../../shared/laserFrame.cjs')

const TICK_MS = 50 // well inside the engine's signal-loss stop (FRAME_TIMEOUT_MS 200)
const RELOAD_MS = 15000 // the document read again: an edit during the show carries without a restart
const MAX_FRAMES = 256
const MAX_FRAME_POINTS_TOTAL = 20000
const BLANK = [0, 0, 0, 0, 0]

const num = (v, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : d)
const isLit = (p) => p[2] > 0 || p[3] > 0 || p[4] > 0

/** A line's group: its id without the trailing letters (rig-laser-1a → rig-laser-1), else the id itself. Pure. */
const groupOfLine = (id) => {
    const s = String(id || '')
    const m = /^(.*\d)[a-z]+$/.exec(s)
    return m ? m[1] : s
}

/** `frames` cleaned as the room cleans them (laserLine.js framesOf): { period, list } or null. Pure. */
const framesOf = (frames) => {
    if (!frames || typeof frames !== 'object' || !Array.isArray(frames.list)) return null
    const period = num(frames.period)
    if (!(period > 0)) return null
    const list = []
    let total = 0
    for (const f of frames.list.slice(0, MAX_FRAMES)) {
        const pts = normaliseFramePoints(f).points
        if (!pts.length) continue
        if (total + pts.length > MAX_FRAME_POINTS_TOTAL) break
        total += pts.length
        list.push(pts)
    }
    return list.length ? { period: Math.min(3600, Math.max(0.05, period)), list } : null
}

/** Which of `frames.list` is on at show time `t` (seconds) — the room's formula. Pure. */
const frameIndexAt = (frames, t) => {
    if (!frames?.list?.length || !(frames.period > 0)) return -1
    const n = frames.list.length
    const phase = ((num(t) % frames.period) + frames.period) % frames.period
    return Math.min(n - 1, Math.floor((phase / frames.period) * n))
}

/**
 * The document's laser lines with frames, grouped by cube: Map groupId → [{ id, frames }], groups and lines in
 * sorted order. Pure.
 */
const lineGroupsOf = (document) => {
    const entities = Array.isArray(document?.entities) ? document.entities : []
    const groups = new Map()
    for (const e of entities) {
        const frames = framesOf(e?.components?.beam?.laser?.frames)
        if (!frames || !e.id) continue
        const g = groupOfLine(e.id)
        if (!groups.has(g)) groups.set(g, [])
        groups.get(g).push({ id: String(e.id), frames })
    }
    const sorted = new Map()
    for (const g of [...groups.keys()].sort()) sorted.set(g, groups.get(g).sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)))
    return sorted
}

/**
 * One cube's drawing at show time `t`: each line's frame on now, lit strokes joined with a blank move to the first
 * point and a blank at the last. A cube with nothing lit draws one blank point (dark, as the compiled frames do). Pure.
 */
const cubeFrameAt = (lines, t) => {
    const out = []
    for (const l of lines) {
        const i = frameIndexAt(l.frames, t)
        if (i < 0) continue
        const pts = l.frames.list[i]
        if (!pts.some(isLit)) continue
        const first = pts[0]
        const last = pts[pts.length - 1]
        out.push([first[0], first[1], 0, 0, 0], ...pts, [last[0], last[1], 0, 0, 0])
    }
    return out.length ? out : [BLANK]
}

/** The frame indices of `lines` at `t`, as one key: it changes exactly when the drawing changes. Pure. */
const frameKeyAt = (lines, t) => lines.map((l) => frameIndexAt(l.frames, t)).join(',')

/** Cubes and groups side by side in sorted order: { cubeId: groupId }. Extra cubes stay unmapped. Pure. */
const defaultMap = (cubeIds, groupIds) => {
    const cubes = [...cubeIds].map(String).sort()
    const groups = [...groupIds].map(String).sort()
    const map = {}
    cubes.forEach((c, i) => { if (i < groups.length) map[c] = groups[i] })
    return map
}

/**
 * The player. `getEngine` gives the engine of the moment (a config reload rebuilds it); `loadDocument(projectId)`
 * resolves to the project's document, or null when there is no such project.
 * @param {{ getEngine: () => object, loadDocument?: (projectId: string) => Promise<object|null>, now?: () => number,
 *   setInterval?: Function, clearInterval?: Function, log?: object }} opts
 */
const createShowPlayer = ({ getEngine, loadDocument, now = Date.now, setInterval: every = setInterval, clearInterval: stopEvery = clearInterval, log = null }) => {
    let run = null // { project, out, map: [{ cube, group, lines, key, held }], groups, timer, startedAt, reloadedAt, reloadMs, error, reloading }

    const groupsFor = async (project) => {
        if (typeof loadDocument !== 'function') return { ok: false, status: 501, error: 'this server cannot read projects for the lasers (no document loader)' }
        const document = await loadDocument(project)
        if (!document) return { ok: false, status: 404, error: `no project "${project}"` }
        const groups = lineGroupsOf(document)
        if (!groups.size) return { ok: false, status: 400, error: `no laser line with frames in "${project}" — the room has nothing to draw either` }
        return { ok: true, groups }
    }

    const mapFor = (groups, wanted) => {
        const cubeIds = getEngine().state().cubes.map((c) => c.id)
        const chosen = wanted && typeof wanted === 'object' ? wanted : defaultMap(cubeIds, groups.keys())
        const map = []
        const unknown = []
        for (const [cube, group] of Object.entries(chosen)) {
            if (!cubeIds.includes(cube)) { unknown.push(`no cube "${cube}"`); continue }
            if (!groups.has(String(group))) { unknown.push(`no laser lines "${group}" for ${cube}`); continue }
            map.push({ cube, group: String(group), lines: groups.get(String(group)), key: null, held: null })
        }
        return { map, unknown }
    }

    const tick = () => {
        if (!run) return
        const engine = getEngine()
        const t = now() / 1000
        for (const m of run.map) {
            const key = frameKeyAt(m.lines, t)
            const res = key !== m.key || m.held ? engine.setFrame(m.cube, cubeFrameAt(m.lines, t), run.out) : engine.alive(m.cube, run.out)
            if (res.ok) { m.key = key; m.held = null } else { m.held = res.error; m.key = null }
        }
        if (now() - run.reloadedAt >= run.reloadMs && !run.reloading) {
            run.reloading = true
            const r = run
            groupsFor(r.project).then((got) => {
                if (run !== r) return
                r.reloadedAt = now()
                if (got.ok) {
                    r.groups = got.groups
                    for (const m of r.map) if (got.groups.has(m.group)) { m.lines = got.groups.get(m.group); m.key = null }
                    r.error = null
                } else r.error = got.error
            }, (e) => { if (run === r) { r.reloadedAt = now(); r.error = e?.message || String(e) } })
                .finally(() => { if (run === r) r.reloading = false })
        }
    }

    const stop = () => {
        if (!run) return { stopped: false }
        const r = run
        run = null
        stopEvery(r.timer)
        const engine = getEngine()
        for (const m of r.map) engine.setFrame(m.cube, [BLANK], r.out) // its cubes go dark; the frame times out as any other
        log?.info?.(`[laser] show "${r.project}" stopped on ${r.map.map((m) => m.cube).join(', ')}`)
        return { stopped: true, project: r.project }
    }

    /** Play `project` on the cubes: { project, map?: { cubeId: groupId }, reloadMs? }. Restarts a running show. */
    const start = async ({ project, map: wanted, reloadMs } = {}) => {
        const id = typeof project === 'string' ? project.trim() : ''
        if (!id) return { ok: false, status: 400, error: 'say which project: { project }' }
        const got = await groupsFor(id)
        if (!got.ok) return got
        const { map, unknown } = mapFor(got.groups, wanted)
        if (!map.length) return { ok: false, status: 400, error: `nothing to play: ${unknown.join('; ') || 'no cubes'}` }
        stop()
        const t0 = now()
        run = { project: id, out: `show:${id}`, map, groups: got.groups, timer: null, startedAt: t0, reloadedAt: t0, reloadMs: Math.max(1000, num(reloadMs, RELOAD_MS)), error: null, reloading: false }
        tick()
        run.timer = every(tick, TICK_MS)
        run.timer?.unref?.()
        log?.info?.(`[laser] show "${id}" playing: ${map.map((m) => `${m.cube} ← ${m.group} (${m.lines.length} lines)`).join(', ')}${unknown.length ? `; ignored: ${unknown.join('; ')}` : ''}`)
        return { ok: true, project: id, ignored: unknown }
    }

    const state = () => {
        if (!run) return { playing: false }
        const t = now() / 1000
        return {
            playing: true,
            project: run.project,
            out: run.out,
            startedAt: run.startedAt,
            reloadedAt: run.reloadedAt,
            error: run.error,
            cubes: run.map.map((m) => ({ cube: m.cube, group: m.group, lines: m.lines.length, period: m.lines[0]?.frames.period ?? null, index: frameIndexAt(m.lines[0]?.frames, t), held: m.held })),
            groups: [...run.groups.keys()]
        }
    }

    return { start, stop, state, tick }
}

module.exports = { createShowPlayer, lineGroupsOf, groupOfLine, framesOf, frameIndexAt, cubeFrameAt, frameKeyAt, defaultMap, TICK_MS, RELOAD_MS }
