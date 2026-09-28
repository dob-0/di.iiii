/**
 * metrics.mjs — pure maths over the rig's frame log. No browser, no I/O, so
 * it is unit-tested (metrics.test.js) against synthetic ramps with known
 * answers.
 *
 * A frame is what probe.mjs logged for one screen render:
 *   { t (ms, performance.now), px, py, pz (camera position, m),
 *     fx, fy, fz (camera forward) }
 */

const RAD = 180 / Math.PI

export const median = (xs) => quantile(xs, 0.5)
export function quantile(xs, q) {
    const a = xs.filter(Number.isFinite).slice().sort((x, y) => x - y)
    if (!a.length) return NaN
    const pos = (a.length - 1) * q
    const lo = Math.floor(pos), hi = Math.ceil(pos)
    return a[lo] + (a[hi] - a[lo]) * (pos - lo)
}
export const mean = (xs) => xs.reduce((s, x) => s + x, 0) / (xs.length || NaN)
export const std = (xs) => {
    const m = mean(xs)
    return Math.sqrt(mean(xs.map((x) => (x - m) ** 2)))
}

/** Camera yaw/pitch in the walker's own convention: lookDir = (sin yaw·cos p, sin p, cos yaw·cos p). */
export const yawOf = (f) => Math.atan2(f.fx, f.fz)
export const pitchOf = (f) => Math.asin(Math.max(-1, Math.min(1, f.fy / Math.hypot(f.fx, f.fy, f.fz))))

/** Frames → rows with unwrapped yaw (deg), pitch (deg), per-frame dt and speeds. */
export function derive(frames) {
    const rows = []
    let yawAcc = 0
    let prevYaw = null
    for (let i = 0; i < frames.length; i++) {
        const f = frames[i]
        const yaw = yawOf(f)
        if (prevYaw !== null) {
            let d = yaw - prevYaw
            while (d > Math.PI) d -= 2 * Math.PI
            while (d < -Math.PI) d += 2 * Math.PI
            yawAcc += d
        } else {
            yawAcc = yaw
        }
        prevYaw = yaw
        const row = { t: f.t, x: f.px, y: f.py, z: f.pz, yawDeg: yawAcc * RAD, pitchDeg: pitchOf(f) * RAD, dt: NaN, step: NaN, vh: NaN, vy: NaN }
        const p = rows[rows.length - 1]
        if (p) {
            row.dt = row.t - p.t
            row.step = Math.hypot(row.x - p.x, row.z - p.z)
            row.vh = row.dt > 0 ? row.step / (row.dt / 1000) : NaN
            row.vy = row.dt > 0 ? (row.y - p.y) / (row.dt / 1000) : NaN
        }
        rows.push(row)
    }
    return rows
}

export const between = (rows, t0, t1) => rows.filter((r) => r.t >= t0 && r.t <= t1)

/** First row at/after t0 for which pred holds; returns its t − t0 (ms) or null. */
export function timeUntil(rows, t0, pred) {
    for (const r of rows) {
        if (r.t < t0) continue
        if (pred(r)) return r.t - t0
    }
    return null
}

/** Frame-time statistics over a list of timestamps (ms). */
export function frameStats(ts) {
    const dts = []
    for (let i = 1; i < ts.length; i++) dts.push(ts[i] - ts[i - 1])
    const p50 = quantile(dts, 0.5)
    return {
        frames: ts.length,
        fps: dts.length ? 1000 / mean(dts) : NaN,
        p50, p95: quantile(dts, 0.95), p99: quantile(dts, 0.99), max: Math.max(...dts),
        // A hitch: a frame that took at least 1.5x the typical one — the eye
        // reads that as a stutter at walking speed.
        hitches: dts.filter((d) => d > 1.5 * p50).length,
        hitchPct: dts.length ? (100 * dts.filter((d) => d > 1.5 * p50).length) / dts.length : NaN
    }
}

/**
 * One press-and-release of a movement input: ramp-up, plateau, stop.
 * tDown/tUp are the page's own event timestamps (same clock as the frames).
 * `axis` 'h' (horizontal speed) or 'y' (vertical rate).
 */
export function pressMetrics(rows, tDown, tUp, { axis = 'h', plateauMs = 700 } = {}) {
    const v = (r) => (axis === 'h' ? r.vh : Math.abs(r.vy))
    const plateau = between(rows, tUp - plateauMs, tUp).map(v)
    const vmax = median(plateau)
    const at = (frac) => timeUntil(rows, tDown, (r) => v(r) >= frac * vmax)
    const t10 = at(0.1), t50 = at(0.5), t90 = at(0.9)
    const restThreshold = Math.max(0.02 * vmax, 0.01)
    // Rest: the first frame after release below 2% of vmax that STAYS there
    // for the next 150 ms (a single slow frame is not a stop).
    let restAt = null
    const after = rows.filter((r) => r.t >= tUp)
    for (let i = 0; i < after.length; i++) {
        if (!(v(after[i]) < restThreshold)) continue
        const hold = after.filter((r) => r.t >= after[i].t && r.t <= after[i].t + 150)
        if (hold.every((r) => !(v(r) >= restThreshold))) { restAt = after[i].t; break }
    }
    const pos = (t) => {
        let best = rows[0]
        for (const r of rows) { if (r.t <= t) best = r; else break }
        return best
    }
    const dist = (a, b) => (axis === 'h' ? Math.hypot(b.x - a.x, b.z - a.z) : Math.abs(b.y - a.y))
    const pUp = pos(tUp)
    const pRest = restAt !== null ? pos(restAt) : null
    const pEnd = rows[rows.length - 1]
    const plateauRows = between(rows, tUp - plateauMs, tUp)
    const steps = plateauRows.map((r) => (axis === 'h' ? r.step : Math.abs(r.vy * r.dt / 1000))).filter(Number.isFinite)
    const speeds = plateauRows.map(v).filter(Number.isFinite)
    return {
        vmax,
        t10, t50, t90,
        // Ramp shape: a linear ramp gives t50/t90 = 0.556, an exponential
        // (1 − e^−t/τ) one 0.301. Tells how the start FEELS, not just how long.
        rampShape: t50 !== null && t90 ? t50 / t90 : null,
        stopMs: restAt !== null ? restAt - tUp : null,
        stopDist: pRest ? dist(pUp, pRest) : null,
        // Anything that still moves after the walker came to rest.
        driftAfterRest: pRest ? dist(pRest, pEnd) : null,
        // Judder on a fixed-refresh screen: how much the per-frame step varies
        // while the input is held steady (coefficient of variation, %). Speed
        // CV isolates the simulation (distance / its own dt).
        stepCvPct: steps.length > 3 ? (100 * std(steps)) / mean(steps) : null,
        speedCvPct: speeds.length > 3 ? (100 * std(speeds)) / mean(speeds) : null
    }
}

/** Camera height oscillation while walking steadily: peak-to-peak (cm) and cycles/s. */
export function bob(rows, t0, t1) {
    const seg = between(rows, t0, t1)
    if (seg.length < 8) return { p2pCm: null, hz: null }
    const ys = seg.map((r) => r.y)
    const m = mean(ys)
    let crossings = 0
    for (let i = 1; i < ys.length; i++) if ((ys[i - 1] - m) * (ys[i] - m) < 0) crossings++
    const secs = (seg[seg.length - 1].t - seg[0].t) / 1000
    return { p2pCm: (Math.max(...ys) - Math.min(...ys)) * 100, hz: secs > 0 ? crossings / 2 / secs : null }
}

/**
 * Latency: for each input timestamp, the first rendered frame after it whose
 * `value` differs from the frame before the input by more than eps. Returns
 * the list of latencies (ms).
 */
export function inputToFrame(rows, inputTimes, value, eps) {
    const out = []
    for (const te of inputTimes) {
        const before = [...rows].reverse().find((r) => r.t <= te)
        if (!before) continue
        const hit = rows.find((r) => r.t > te && Math.abs(value(r) - value(before)) > eps)
        if (hit) out.push(hit.t - te)
    }
    return out
}

/** Frames after tStart until yaw is within tol of its final value. */
export function settleFrames(rows, tStart, tolDeg = 0.05) {
    const seg = rows.filter((r) => r.t >= tStart)
    if (!seg.length) return null
    const final = seg[seg.length - 1].yawDeg
    const start = [...rows].reverse().find((r) => r.t < tStart)
    if (!start || Math.abs(final - start.yawDeg) < tolDeg) return null
    for (let i = 0; i < seg.length; i++) {
        if (seg.slice(i).every((r) => Math.abs(r.yawDeg - final) <= tolDeg)) return i + 1
    }
    return null
}

/** Mouse-sensitivity conversions from a measured degrees-per-count. */
export function sensitivity(degPerCount, dpi = 800) {
    const countsPer360 = 360 / degPerCount
    return {
        degPerCount,
        countsPer360,
        cmPer360: (countsPer360 / dpi) * 2.54,
        // CS2 and Apex both turn m_yaw = 0.022 deg per count × sensitivity,
        // so one number is the in-game sensitivity for either.
        sourceSens: degPerCount / 0.022
    }
}
