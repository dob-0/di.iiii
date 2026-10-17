// THE WALL'S PLAYHEAD, SAID TO THE ROOM (2026-10-17, docs/ai/decisions/2026-10-17-cubes-follow-the-wall.md).
//
// The 3D room draws a LaserCube's lines only while the cubes really play (dmxPose.js: a laser rests dark), and it
// draws the frame on at the show's time. When di's own player (laserShow.js) plays, GET /laser/api/state says so.
// A player in its own process (scripts/laser/show-player.mjs: its own engine, one sender per cube) is not di's
// player, so the room saw `playing: false` and drew nothing, and its clock (shifted with --at) and its blend
// (--tween) were unknown to the room. This is the one place that player tells di what it plays:
//
//   POST /laser/api/show/playhead { project, clockShiftMs, tween, scale, cubes: [{ cube, group }], ttlMs }
//   POST /laser/api/show/playhead { playing: false }        — the player stopped
//
// The playhead is a CLAIM held in memory only: it sends nothing to a cube, arms nothing, writes no file. It expires
// `ttlMs` after the last announcement (default 5 s, 1–30 s), so a player that dies without a word reads dark within
// seconds — the safe direction (the room shows dark rather than a show that stopped). The player re-announces every
// ~2 s. The show time both sides use: t = (unix ms + clockShiftMs) / 1000 (laserShow.js frameIndexAt / poseAt).
const DEFAULT_TTL_MS = 5000
const MIN_TTL_MS = 1000
const MAX_TTL_MS = 30000
const MAX_SHIFT_MS = 24 * 3600 * 1000
const MAX_CUBES = 64

const num = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d)
const text = (v, max = 120) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null)

/** A body as a playhead, or { error } when it cannot be one. Pure. */
const playheadOf = (body = {}) => {
    const project = text(body.project)
    if (!project) return { error: 'project is required' }
    const shift = Number(body.clockShiftMs ?? 0)
    if (!Number.isFinite(shift) || Math.abs(shift) > MAX_SHIFT_MS) return { error: 'clockShiftMs must be a number of milliseconds within a day' }
    const cubes = (Array.isArray(body.cubes) ? body.cubes : []).slice(0, MAX_CUBES)
        .map((c) => ({ cube: text(c?.cube), group: text(c?.group) }))
        .filter((c) => c.cube)
    const scale = body.scale === 'fit' ? 'fit' : Math.min(10, Math.max(0.1, num(body.scale, 1)))
    const ttlMs = Math.min(MAX_TTL_MS, Math.max(MIN_TTL_MS, num(body.ttlMs, DEFAULT_TTL_MS)))
    return { project, clockShiftMs: Math.round(shift), tween: body.tween === true, scale, cubes, ttlMs }
}

/** The announced playhead: announce / clear / state. `now` is unix ms (injected for tests). */
const createPlayhead = ({ now = Date.now } = {}) => {
    let held = null
    const announce = (body = {}) => {
        if (body.playing === false) { held = null; return { ok: true, playing: false } }
        const got = playheadOf(body)
        if (got.error) return { ok: false, status: 400, error: got.error }
        held = { ...got, seenAt: now() }
        return { ok: true, playing: true }
    }
    const state = () => {
        if (!held) return { playing: false }
        const t = now()
        if (t - held.seenAt > held.ttlMs) { held = null; return { playing: false } }
        const { ttlMs, ...rest } = held
        return { playing: true, source: 'outside', ...rest, expiresAt: held.seenAt + ttlMs }
    }
    return { announce, clear: () => { held = null }, state }
}

/**
 * What GET /laser/api/state says under `show`: di's own player when it plays (its clock is di's, shift 0), else a fresh
 * outside playhead, else not playing. Pure.
 */
const showStateOf = (own, outside) => {
    if (own?.playing) return { source: 'di', clockShiftMs: 0, ...own }
    if (outside?.playing) return outside
    return { playing: false }
}

module.exports = { createPlayhead, playheadOf, showStateOf, DEFAULT_TTL_MS }
