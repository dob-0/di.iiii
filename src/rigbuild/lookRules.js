// THE AIM RULES a designed look is written in — ported from the rig script that
// designed MOXIR's looks: scripts/place/rig-lib.mjs `AIM_RULES` on feat/moxir-hall at
// 70dbdd95 (2026-09-28, "the DJ booth on the nave centre line"). Once that commit is
// merged below this one both copies carry every rule; src/rigbuild/lookRules.test.js holds
// the two equal on every rule they share (`backdrop` against a stage with a backdrop, the
// only way the script calls it — the port alone also answers with none). docs/architecture/RIG_BUILD.md §11.4.
//
// A look is DESIGNED, never ad-hoc (the owner, 2026-09-27: ad-hoc aims are "randome"):
// each group of lamps gets one rule and its numbers, and the rule turns a lamp's place
// into where it points. Every rule is written in the stage's frame, so a look is
// symmetric by construction.
//
//   slot  { pos: [x, y, z] the MOUNT, orient: 'hung' | 'floor', column?: { faceX } }
//   meta  { rank, n } — the lamp's place in its group, left to right
//   ctx   { axis, stage: { axis, into, front, back, deck, wall, backdrop }, hall: {
//           geometry: { runway_bottom_m, truss_top_centre_m } } }
// Each returns { target } (a room point) or { dir } (a room direction).

const DEG = Math.PI / 180

const axisOf = (ctx) => ctx.axis ?? 0
const stagePoint = (ctx, x, y, a) => [axisOf(ctx) + x, y, ctx.stage.front + ctx.stage.into * a]
const sideOf = (slot, ctx) => {
    const dx = slot.pos[0] - axisOf(ctx)
    return Math.abs(dx) < 0.05 ? 0 : Math.sign(dx)
}
const upOf = (slot) => (slot.orient === 'hung' ? -1 : 1)
const leaned = (ctx, slot, sideDeg, leanDeg) => {
    const s = sideDeg * DEG
    const l = leanDeg * DEG
    const up = upOf(slot)
    return [Math.sin(s), up * Math.cos(s) * Math.cos(l), Math.cos(s) * Math.sin(l) * ctx.stage.into]
}
// The crane bridge over the stage: the rig script's (ctx.stage.crane), the hall's nearest
// (ctx.hall.geometry.cranes), or the room's plan (lookFrame: ctx.crane).
const craneOf = (ctx) => {
    if (ctx.stage?.crane) return ctx.stage.crane
    if (ctx.crane) return ctx.crane
    const list = ctx.hall?.geometry?.cranes || []
    return list.length ? [...list].sort((a, b) => Math.abs(a.z_m - ctx.stage.front) - Math.abs(b.z_m - ctx.stage.front))[0] : null
}
const frontBox = (ctx, x) => {
    const boxes = (ctx.stage.backdrop?.boxes || []).filter((m) => x >= m.x_m[0] - 1e-6 && x <= m.x_m[1] + 1e-6)
    if (!boxes.length) return null
    return boxes.reduce((a, b) => (ctx.stage.into * (b.z_m[1] - a.z_m[1]) > 0 ? b : a))
}

const unit2 = (v, fallback) => {
    const l = Math.hypot(v[0], v[1])
    return l < 1e-6 ? fallback : [v[0] / l, v[1] / l]
}
// The DJ in plan: the middle of the performer's box — the rig script's `djCentre`, from the stage alone.
const djCentre = (ctx) => {
    const s = ctx.stage
    return [s.axis ?? axisOf(ctx), (s.back + s.into * 0.1 + s.front - s.into * 0.2) / 2]
}

export const AIM_RULES = {
    vertical: (slot, meta, ctx, p = {}) => ({ dir: leaned(ctx, slot, -sideOf(slot, ctx) * (p.in_deg ?? 0), p.lean_deg ?? 0) }),
    parallel: (slot, meta, ctx, p = {}) => ({ dir: leaned(ctx, slot, p.side_deg ?? 0, p.lean_deg ?? 0) }),
    fan: (slot, meta, ctx, p = {}) => {
        const spreadDeg = p.spread_deg ?? 60
        const k = meta.n <= 1 ? 0 : meta.rank / (meta.n - 1) - 0.5
        return { dir: leaned(ctx, slot, k * spreadDeg, p.lean_deg ?? 0) }
    },
    point: (slot, meta, ctx, p = {}) => ({ target: stagePoint(ctx, p.x ?? 0, p.y ?? 8, p.a ?? 15) }),
    'mirror-point': (slot, meta, ctx, p = {}) => ({ target: stagePoint(ctx, sideOf(slot, ctx) * (p.x ?? 0), p.y ?? 8, p.a ?? 15) }),
    cross: (slot, meta, ctx, p = {}) => ({
        target: [axisOf(ctx) - sideOf(slot, ctx) * (p.x ?? 8), p.y ?? 9, slot.pos[2] + ctx.stage.into * (p.dz ?? 0)]
    }),
    'x-cross': (slot, meta, ctx, p = {}) => ({ target: stagePoint(ctx, -sideOf(slot, ctx) * (p.x ?? 8), p.y ?? 12, p.a ?? 10) }),
    'booth-key': (slot, meta, ctx, p = {}) => ({
        target: [ctx.stage.axis, ctx.stage.deck + (p.h ?? 1.6), p.a === undefined ? (ctx.stage.front + ctx.stage.back) / 2 : ctx.stage.front + ctx.stage.into * p.a]
    }),
    'up-the-column': (slot, meta, ctx) => ({ target: [slot.column?.faceX ?? slot.pos[0], ctx.hall.geometry.runway_bottom_m, slot.pos[2]] }),
    backdrop: (slot, meta, ctx, p = {}) => {
        const box = frontBox(ctx, slot.pos[0])
        if (!box) return { target: [slot.pos[0], 3 * (p.h ?? 0.6), ctx.stage.backdrop?.face ?? ctx.stage.wall] }
        const face = ctx.stage.into > 0 ? box.z_m[1] : box.z_m[0]
        return { target: [slot.pos[0], box.y_m[0] + (box.y_m[1] - box.y_m[0]) * (p.h ?? 0.6), face] }
    },
    'stage-wash': (slot, meta, ctx, p = {}) => (Math.min(meta.rank, meta.n - 1 - meta.rank) % 2 === 0
        // `deck_h`: focus height over the deck (0 = the deck floor); a booth focuses at the DJ's chest (scripts/place/rig-lib.mjs, 2026-09-28)
        ? { target: [axisOf(ctx) + (slot.pos[0] - axisOf(ctx)) * 0.8, ctx.stage.deck + (p.deck_h ?? 0), ctx.stage.front - ctx.stage.into * (p.deck_a ?? 1.5)] }
        : { target: [axisOf(ctx) + (slot.pos[0] - axisOf(ctx)) * 1.1, p.wall_y ?? (ctx.stage.backdrop ? 3 : 7), ctx.stage.wall] }),
    // Hung under a crane girder, straight down onto the floor, splayed out (no girder on a
    // position of view C: then straight along the lamp's own line).
    'down-from-crane': (slot) => ({ target: [slot.pos[0] * 1.1, 0, slot.pos[2] + (slot.girder || 0) * 4] }),
    // A PAR on the line hung from the crane grazing the bridge's underside, outward along it
    // (scripts/place/rig-lib.mjs, 2026-09-28: the bridge as a frame of light over the DJ).
    'bridge-underside': (slot, meta, ctx, p = {}) => {
        const crane = craneOf(ctx)
        if (!crane) return { dir: leaned(ctx, slot, sideOf(slot, ctx) * 70, 0) }
        return { target: [slot.pos[0] + sideOf(slot, ctx) * (p.out ?? 6), crane.girder_bottom_m, crane.z_m + ctx.stage.into * (p.girder ?? 1.1)] }
    },
    // THE HALO'S RULES (a flat triangle hung from the crane over the DJ; RIG_BUILD.md §15.8):
    // `ring` — to a circle of radius r round the DJ at height y (default the deck), on the
    // lamp's own bearing; `dj-point` — one point h over the deck above the DJ (two lamps from
    // opposite corners cross there: the X); `radial` — out from the halo's centre (the axis
    // under the bridge), elev_deg above/below the horizon, bent to_audience toward the house.
    ring: (slot, meta, ctx, p = {}) => {
        const [cx, cz] = djCentre(ctx)
        const u = unit2([slot.pos[0] - cx, slot.pos[2] - cz], [0, ctx.stage.into])
        const r = p.r ?? 1.2
        return { target: [cx + u[0] * r, p.y ?? ctx.stage.deck, cz + u[1] * r] }
    },
    'dj-point': (slot, meta, ctx, p = {}) => {
        const [cx, cz] = djCentre(ctx)
        return { target: [cx + (p.x ?? 0), ctx.stage.deck + (p.h ?? 2.8), cz + ctx.stage.into * (p.dz ?? 0)] }
    },
    radial: (slot, meta, ctx, p = {}) => {
        const crane = craneOf(ctx)
        const c = [axisOf(ctx), crane ? crane.z_m : (ctx.stage.back + ctx.stage.front) / 2]
        const out = unit2([slot.pos[0] - c[0], slot.pos[2] - c[1]], [0, ctx.stage.into])
        const k = p.to_audience ?? 0
        const u = unit2([out[0] * (1 - k), out[1] * (1 - k) + ctx.stage.into * k], [0, ctx.stage.into])
        const e = (p.elev_deg ?? -20) * DEG
        return { dir: [u[0] * Math.cos(e), Math.sin(e), u[1] * Math.cos(e)] }
    },
    // The X lying down (crane-x, scripts/place/rig-lib.mjs, 2026-09-29): out along the lamp's own
    // arm, away from the crossing (the crane bridge's centre line on the axis), rising `rise_deg`;
    // lamps nearer than `end_m` use `inner_rise_deg`, the bridge arm's `x_rise_deg`.
    'along-arm': (slot, meta, ctx, p = {}) => {
        const crane = craneOf(ctx)
        const h = [slot.pos[0] - axisOf(ctx), slot.pos[2] - (crane ? crane.z_m : slot.pos[2])]
        const d = Math.hypot(h[0], h[1])
        const up = upOf(slot)
        const end = d >= (p.end_m ?? 2)
        if (d < 0.05 || (!end && p.inner === 'vertical')) return { dir: [0, up, 0] }
        const onX = Math.abs(h[1]) < 0.05
        const r = (onX && p.x_rise_deg !== undefined ? p.x_rise_deg : end ? (p.rise_deg ?? 45) : (p.inner_rise_deg ?? p.rise_deg ?? 45)) * DEG
        return { dir: [(h[0] / d) * Math.cos(r), up * Math.sin(r), (h[1] / d) * Math.cos(r)] }
    },
    'laser-into-roof': (slot, meta, ctx, p = {}) => ({ target: [axisOf(ctx) + (slot.pos[0] - axisOf(ctx)) * (p.x_scale ?? 0.3), ctx.hall.geometry.truss_top_centre_m, ctx.stage.front + ctx.stage.into * (p.a ?? 14)] })
}

export const RULE_NAMES = Object.keys(AIM_RULES)

const unit = (v) => {
    const l = Math.hypot(v[0], v[1], v[2]) || 1
    return [v[0] / l, v[1] / l, v[2] / l]
}

/** A rule's answer as a unit direction from `from`. */
export const aimDirection = (answer, from) => {
    if (answer?.dir) return unit(answer.dir)
    if (answer?.target) return unit([answer.target[0] - from[0], answer.target[1] - from[1], answer.target[2] - from[2]])
    return null
}

/**
 * Pan and tilt (degrees, the spot's own language — src/project/viewport/spotLightAim.js)
 * for a beam direction: d = (-sin t sin p, -cos t, -sin t cos p).
 */
export const panTiltOfDirection = ([x, y, z]) => {
    const tilt = Math.acos(Math.max(-1, Math.min(1, -y)))
    const flat = Math.sin(tilt)
    const pan = Math.abs(flat) < 1e-9 ? 0 : Math.atan2(-x, -z)
    return { pan: pan / DEG, tilt: tilt / DEG }
}
