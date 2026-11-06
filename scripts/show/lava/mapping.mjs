/** mapping.mjs — game events -> shared lava state -> lasers / DMX / surface. Pure. */
import { clamp } from './safety.mjs'

export const BURN_MS = 600

/** The hub's one state, updated by game messages. */
export class LavaState {
    constructor() { this.lava = 0; this.hearts = 5; this.step = 0; this.tile = null; this.mode = 'ready'; this.burnAt = -Infinity; this.last = null }
    apply(msg, nowMs) {
        if (!msg || typeof msg !== 'object') return false
        const ev = String(msg.event || 'beat')
        if (Number.isFinite(msg.lava)) this.lava = clamp(msg.lava)
        if (Number.isFinite(msg.hearts)) this.hearts = msg.hearts
        if (Number.isFinite(msg.step)) this.step = msg.step
        if (Array.isArray(msg.tile)) this.tile = msg.tile
        if (ev === 'start') this.mode = 'play'
        else if (ev === 'win') this.mode = 'won'
        else if (ev === 'dead') this.mode = 'dead'
        else if (ev === 'restart') { this.mode = 'ready'; this.lava = 0; this.hearts = 5 }
        else if (ev === 'burn') this.burnAt = nowMs
        this.last = ev
        return true
    }
    /** 0..1 burn, decays over BURN_MS. */
    burn(nowMs) { return clamp(1 - (nowMs - this.burnAt) / BURN_MS) }
    view(nowMs) { return { lava: this.lava, burn: this.burn(nowMs), mode: this.mode } }
}

const lerp = (a, b, t) => a + (b - a) * t
/** Deep red -> orange -> yellow-white edge. level 0..1 -> [r,g,b] 0..1. */
export const lavaColor = (level) => {
    const l = clamp(level)
    const stops = [[0, [0.35, 0, 0]], [0.55, [1, 0.3, 0]], [1, [1, 0.9, 0.55]]]
    for (let i = 1; i < stops.length; i++) {
        if (l <= stops[i][0]) {
            const [a, ca] = stops[i - 1]
            const [b, cb] = stops[i]
            const t = (l - a) / (b - a)
            return ca.map((v, k) => lerp(v, cb[k], t))
        }
    }
    return stops[2][1]
}

/** 12 channels 0..1 (4 RGB fixtures at 1,4,7,10); a per-fixture phase so the lava flows. */
export const dmxChannels = (view, tSec) => {
    const out = []
    const speed = 0.3 + view.lava * 1.2
    for (let f = 0; f < 4; f++) {
        const wave = 0.5 + 0.5 * Math.sin(tSec * speed * Math.PI * 0.5 - f * 1.3)
        const level = clamp(view.lava * 0.75 + 0.15 + (wave - 0.5) * 0.25)
        let [r, g, b] = lavaColor(level)
        let k = 0.45 + 0.55 * wave
        if (view.mode === 'won') { r = lerp(r, 0.5, 0.7); g = lerp(g, 0.8, 0.7); b = lerp(b, 1, 0.7); k = 0.8 }
        if (view.mode === 'dead') { r = 0.9; g = 0; b = 0; k = 0.4 + 0.3 * Math.sin(tSec * Math.PI) }
        const bl = clamp(view.burn)
        out.push(lerp(r * k, 1, bl), lerp(g * k, 0, bl), lerp(b * k, 0, bl))
    }
    return out
}

export const toBytes = (ch) => Uint8Array.from(ch.map((v) => Math.round(clamp(v) * 255)))

/** Quantised look key: a new laser frame is posted only when this changes. */
export const laserKey = (view) => `${view.mode}|${Math.round(clamp(view.lava) * 10)}|${view.burn > 0.3 ? 'b' : '-'}`

/** Warm wavy lines. Points [x,y,r,g,b], x,y -1..1, colours 0..1. Static: one POST per look. */
export const laserPoints = (view) => {
    const lava = Math.round(clamp(view.lava) * 10) / 10
    const lines = 2 + Math.round(lava * 2)
    const amp = 0.08 + lava * 0.28
    const waves = 1.5 + lava * 3
    let [r, g, b] = lavaColor(Math.max(0.2, lava))
    if (view.mode === 'dead') [r, g, b] = [0.9, 0, 0]
    if (view.mode === 'won') [r, g, b] = [0.4, 0.8, 1]
    if (view.burn > 0.3) [r, g, b] = [1, 0, 0]
    const bloom = view.burn > 0.3 ? 1.5 : 1
    const N = 40
    const xs = (i) => -0.9 + (1.8 * i) / N
    const pts = []
    for (let l = 0; l < lines; l++) {
        const y0 = -0.6 + (1.2 * l) / (lines - 1)
        const rev = l % 2 === 1
        pts.push([xs(rev ? N : 0), clamp(y0, -1, 1), 0, 0, 0]) // blank move to the start
        for (let i = 0; i <= N; i++) {
            const j = rev ? N - i : i
            pts.push([xs(j), clamp(y0 + Math.sin((j / N) * waves * Math.PI * 2 + l) * amp * bloom, -1, 1), r, g, b])
        }
    }
    return pts
}
