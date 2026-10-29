#!/usr/bin/env node
// scenes_flash.cjs — the flash check of a scenes file, scene by scene, on the desk's own engine (2026-10-17).
// Every scene's `motion` {mode, bpm, depth, spatial} is played through serverXR/src/lighting/fx.js (read-only) for 120 s on 12 lamps;
// a flash is a pair of opposing changes >= 10 % of full (WCAG 2.x "general flash" threshold), counted with 0.1 hysteresis on each
// lamp's multiplier; the worst count in any 1 s window is the scene's number. The limit is the file's own `rules.flash` (default 3 a
// second, WCAG 2.3.1 "three flashes"). Method from the scenes job of 2026-10-15 (flashrate.cjs, a table per mode × bpm), moved here
// so each FILE is measured at its own tempi: that table read by eye let "sparkle at 33 bpm" pass as 3 when it is 4.
//   node scripts/place/scenes_flash.cjs SCENES.json [--max 3] [--json]      exit 0 = every scene within the limit, 1 = one or more over, 2 = bad input
const fs = require('node:fs')
const path = require('node:path')
const { pathToFileURL } = require('node:url')
const fx = require(path.join(__dirname, '../../serverXR/src/lighting/fx.js'))
const args = process.argv.slice(2)
const file = args.find((a) => !a.startsWith('--'))
if (!file) { console.error('usage: scenes_flash.cjs SCENES.json [--max N] [--json]'); process.exit(2) }
const doc = JSON.parse(fs.readFileSync(file, 'utf8'))
const iMax = args.indexOf('--max')
const N = 12, STEP = 25, T = 120000
const lamps = Array.from({ length: N }, (_, i) => ({ x: -1 + 3 * i / (N - 1), y: 0.5 + 0.1 * (i % 3) }))
// The counting and the default limit are src/project/nodes/flashRule.js, the Flash Guard node's own rule (one source).
import(pathToFileURL(path.join(__dirname, '../../src/project/nodes/flashRule.js')).href).then((rule) => {
const MAX = iMax >= 0 ? Number(args[iMax + 1]) : rule.FLASH_LIMIT_PER_SECOND
function worst(mode, bpm, depth, spatial) {
    const cfg = { mode, bpm, depth, spatial, enabled: true, epoch: 0 }
    let worst1 = 0
    for (let i = 0; i < N; i++) {
        const samples = []
        for (let t = 0; t < T; t += STEP) samples.push({ at: t, value: fx.fxLevel(cfg, lamps[i], i, N, t) / 255 })
        worst1 = Math.max(worst1, rule.mostChangesInWindow(rule.changeTimes(samples)))
    }
    return Math.floor(worst1 / 2)
}
const rows = (doc.scenes || []).map((s) => {
    const m = s.motion
    if (!m || !m.mode || m.mode === 'none') return { id: s.id, mode: 'none', flashes: 0 }
    return { id: s.id, mode: m.mode, bpm: m.bpm, depth: m.depth ?? 255, spatial: m.spatial || 'patch', flashes: worst(m.mode, m.bpm, m.depth ?? 255, m.spatial || 'patch') }
})
const over = rows.filter((r) => r.flashes > MAX)
if (args.includes('--json')) console.log(JSON.stringify({ max: MAX, over: over.length, rows }))
else {
    for (const r of rows) if (r.mode !== 'none') console.log(`${r.flashes > MAX ? 'OVER' : 'ok  '} ${String(r.flashes).padStart(2)}/s  ${r.id}  (${r.mode} ${r.bpm} bpm, depth ${r.depth}, ${r.spatial})`)
    console.log(`${rows.length} scenes, ${over.length} over ${MAX} flashes a second`)
}
process.exit(over.length ? 1 : 0)
})
