#!/usr/bin/env node
/**
 * la40-player.mjs — play the two UP-LA40WF 40 W lasers with the desk's cue list, from the desk's held (raw) layer.
 *
 * WORKAROUND (2026-10-17, MOXIR show night), named as one: a look cannot light a 40 W safely yet — the build drops
 * `laserSignedOff` and the type's defaults put graphic 0 (a STATIC beam) at the centre (READY-v2-2.md). Owed fix: pass
 * `laserSignedOff` through scenes_to_rig.py and epic-build.mjs, and give the up-la40wf type a moving default (ledger row).
 *
 * The officer's word (owner, 2026-10-17 20:1x–20:3x): "use the full power of the lasers too it safe", "we can use the all in full power".
 * Values are the ones TESTED on the wire by the owner's shape walk this morning (docs/moxir/devices/la40wf-shape-wire-log-2026-10-17.txt):
 * ch1 dimmer 255 · ch2 250 · ch3 graphic · ch4 0 · ch5 colour · ch6 64 · ch7 64 (X/Y centre). Graphics only from the walked range
 * (the never-use values and dots are read from scripts/place/fixtures/charts/up-la40wf.json, not retyped here).
 *
 *   node scripts/rigbuild/la40-player.mjs --cues 2,8,10 [--units 137,169] [--universe 1] [--desk http://diiii.localhost/light]
 *        [--colour 25] [--every 8] [--preview 30]
 * --cues     the 1-based cue numbers in which the 40 W play (dark in every other cue)
 * --units    the first channel of each unit on that universe (U2 = raw universe 1)
 * --colour   ch5 value: 8 white, 25 red, 42 green (the colour table: 0-16 white, 17-33 red, 34-50 green, …)
 * --every    seconds per graphic while a laser cue plays (cycles the graphics list)
 * --preview  seconds to play at once, whatever the cue, so the officer can see where they land, then follow the cues
 * Holds only its own 14 channels; releases them (value -1) on exit, SIGINT or SIGTERM. Writes a line a change to stdout.
 */
import { readFileSync } from 'node:fs'
const args = Object.fromEntries(process.argv.slice(2).reduce((o, a, i, all) => (a.startsWith('--') ? [...o, [a.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : true]] : o), []))
const desk = String(args.desk || 'http://diiii.localhost/light')
const universe = Number(args.universe ?? 1)
const units = String(args.units || '137,169').split(',').map(Number)
const cues = new Set(String(args.cues || '').split(',').filter(Boolean).map(Number))
const colour = Number(args.colour ?? 25)
// --colours "2:25,8:42" — ch5 per cue (the scene's colour family), else --colour
const colourOf = new Map(String(args.colours || '').split(',').filter(Boolean).map((p) => p.split(':').map(Number)))
const every = Number(args.every || 8) * 1000
const previewUntil = Date.now() + Number(args.preview || 0) * 1000
// --graphics 1,5,8 — the shapes to cycle (owner 20:4x: "only lines and cool underground ones": the horizontal lines of the
// walk sheet la40wf-shapes-by-value-1: 1 one line, 2 dashed, 5 two parallel, 8 and 10 staggered layers, 27 dashed, 48 three stacked)
const GRAPHICS = String(args.graphics || '1,5,8,10,48,2,27').split(',').map(Number)
// The never-use values and the dot ranges live in the device's chart (one home); this player only reads them.
const chart = JSON.parse(readFileSync(new URL('../place/fixtures/charts/up-la40wf.json', import.meta.url), 'utf8')).graphics
const NEVER = new Set(chart.neverUseValues)
const dot = (g) => chart.safety.dotValueRanges.some(([a, b]) => g >= a && g <= b)
if (GRAPHICS.some((g) => NEVER.has(g) || dot(g))) throw new Error('a forbidden graphic is in the list')
if (!cues.size && !args.preview) { console.log('usage: --cues 2,8,… (1-based) [--preview 30]'); process.exit(2) }

const raw = async (channels) => {
    const r = await fetch(`${desk}/api/raw`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ owner: 'la40-player', channels }) })
    if (!r.ok) throw new Error(`raw ${r.status} ${await r.text()}`)
}
const frame = (on, g, c) => units.flatMap((base) => (on ? [255, 250, g, 0, c, 64, 64] : [0, 0, 0, 0, 0, 64, 64]).map((value, i) => ({ universe, channel: base + i, value })))
let state = ''
const tick = async () => {
    const st = await (await fetch(`${desk}/api/state`)).json()
    const i = st?.cues?.index
    const cue = Number.isInteger(i) ? i + 1 : null
    const on = Date.now() < previewUntil || (cue !== null && cues.has(cue))
    const g = GRAPHICS[Math.floor(Date.now() / every) % GRAPHICS.length]
    const c = colourOf.get(cue) ?? colour
    await raw(frame(on, g, c))
    const now = on ? `ON graphic ${g} colour ${c} (cue ${cue}${Date.now() < previewUntil ? ', preview' : ''})` : `dark (cue ${cue})`
    if (now !== state) { console.log(`${new Date().toISOString().slice(11, 19)} ${now}`); state = now }
}
const release = async () => {
    try { await raw(units.flatMap((base) => Array.from({ length: 7 }, (_, i) => ({ universe, channel: base + i, value: -1 })))); console.log('released') } catch (e) { console.log('release failed', e.message) }
    process.exit(0)
}
process.on('SIGINT', release); process.on('SIGTERM', release)
for (;;) { try { await tick() } catch (e) { console.log('tick', e.message) } await new Promise((r) => setTimeout(r, 1000)) }
