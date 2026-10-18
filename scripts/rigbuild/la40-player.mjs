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
 * (never 74, 75, 78, 79, 166, 167, 246–253; never the dots 146–165, 185–187 — the owner's rule, memory reference_la40wf_graphics).
 *
 *   node scripts/rigbuild/la40-player.mjs --cues 2,8,10 [--units 137,169] [--universe 1] [--desk http://diiii.localhost/light]
 *        [--colour 25] [--every 8] [--preview 30]
 * --cues     the 1-based cue numbers in which the 40 W play (dark in every other cue)
 * --units    the first channel of each unit on that universe (U2 = raw universe 1)
 * --colour   ch5 value: 8 white, 25 red, 42 green (the colour table: 0-16 white, 17-33 red, 34-50 green, …)
 * --every    seconds per graphic while a laser cue plays (cycles the graphics list)
 * --plan     a JSON file {"cues": {"<n>": {"graphics": [..], "colour": c, "every": s, "note": "why"}}}: per scene its own shapes,
 *            colour and pace (v4, owner 2026-10-17 23:5x: "make them suit our scenes"); a cue in the plan plays even without --cues
 * --dry-run  print what each cue would play and exit (sends nothing)
 * --preview  seconds to play at once, whatever the cue, so the officer can see where they land, then follow the cues
 * Holds only its own 14 channels; releases them (value -1) on exit, SIGINT or SIGTERM. Writes a line a change to stdout.
 */
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
const planFile = args.plan ? JSON.parse((await import('node:fs')).readFileSync(String(args.plan), 'utf8')) : {}
const plan = planFile.cues || {}
plan.__allowStatic = planFile.allowStatic === true
for (const n of Object.keys(plan)) if (n !== '__allowStatic' && !n.startsWith('look:')) cues.add(Number(n))
const NEVER = new Set([74, 75, 78, 79, 166, 167, 246, 247, 248, 249, 250, 251, 252, 253])
// Static dots refused unless the plan says the owner allowed them (owner 2026-10-18 00:1x: "yes" — dots and 0 play at MOXIR).
const allowStatic = Boolean(args['allow-static']) || plan.__allowStatic === true
const dot = (g) => !allowStatic && ((g >= 146 && g <= 165) || (g >= 185 && g <= 187))
const bad = (list) => !list.length || list.some((g) => !Number.isInteger(g) || g < 0 || g > 255 || NEVER.has(g) || dot(g))
if (bad(GRAPHICS)) throw new Error('a forbidden graphic is in the list')
for (const [n, p] of Object.entries(plan)) if (n !== '__allowStatic') if (bad(p.graphics || GRAPHICS)) throw new Error(`cue ${n}: a forbidden or empty graphic list`)
const playOf = (cue) => { const p = plan[cue] || {}; return { then: p.then || null, colours: p.colours || null, anim: p.anim || {}, list: p.graphics || GRAPHICS, colour: p.colour ?? colourOf.get(cue) ?? colour, every: (p.every ? Number(p.every) * 1000 : every) } }
if (args['dry-run']) { for (const n of [...cues].sort((a, b) => a - b)) { const q = playOf(n); console.log(`cue ${n}: graphics ${q.list.join(',')} · colour ${q.colour} · every ${q.every / 1000}s${plan[n]?.note ? ' · ' + plan[n].note : ''}`) } process.exit(0) }
if (!cues.size && !args.preview) { console.log('usage: --cues 2,8,… (1-based) [--preview 30]'); process.exit(2) }

const raw = async (channels) => {
    const r = await fetch(`${desk}/api/raw`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ channels }) })
    if (!r.ok) throw new Error(`raw ${r.status} ${await r.text()}`)
}
// anim (plan, optional): ch6 X move, ch8 zoom, ch11 centre rotation, ch12 gradual painting, ch13 X wave; ch7 Y is always 64 (no up-down sweep).
const SPAN = 32
const DIMMER = Math.max(0, Math.min(255, Number(args.dimmer ?? 255)))   // --dimmer 0-255: ch1 of both units when on (owner 05:1x: "dimmers 70" = 70 % = 179)
// --rgb (owner 2026-10-18 02:3x: "both 40 W the same colour in every scene"): the units' own colour tables differ (unit 137 mixes white
// greenish, same DMX tested), so colour is set by the diodes instead: ch5 white (8) and ch16-18 modulation (0 = full, 255 = off).
// 25 red -> red diode only; 42 green -> green only; 8 white -> all three (+ --trim). Both units get the same diode set.
const RGB_MODE = Boolean(args.rgb)
const DIODES = { 25: [0, 255, 255], 42: [255, 0, 255], 8: [0, 0, 0], 76: [0, 90, 255] }
// --trim 137:g=100,169:r=0 — a unit's own colour trim on its modulation channels (ch16 red, ch17 green, ch18 blue; 0 = full), for a
// unit whose diodes mix differently (2026-10-18: unit 137's white had a green cast, unit 169's was clean; same DMX on both, tested).
const TRIM = new Map(String(args.trim || '').split(',').filter(Boolean).map((t) => { const [u, kv] = t.split(':'); return [Number(u), Object.fromEntries(kv.split('+').map((x) => x.split('=')).map(([k, v]) => [k, Number(v)]))] }))
// The full 32-ch mode (up-la40wf.json mode 32, APPROVED): ch1-19 the first graphic, ch20-32 a SECOND graphic drawn at the same time.
// anim keys: x zoom xrot yrot rot paint xwave (1st) · g2 (graphic list for the 2nd, else none) x2 zoom2 xrot2 yrot2 rot2 paint2 xwave2.
// Never set: Y move / Y wave (ch7, ch14, ch24, ch31 stay 64 / 0: no up-down sweep), strobe ch15 (flash rule), colour modulation ch16-18 (0 = full).
const frame = (on, g, c, a = {}, g2 = null) => units.flatMap((base) => {
    // Dark = dimmer 0 BUT mode 250 (built-in graphics) and colour red: ch2 0-49 is the unit's own AUTO program, which ignores the
    // dimmer and flashed white between scenes (owner 2026-10-18 05:2x).
    const off = [0, 250, 1, 0, 28, 64, 64, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 28, 64, 64, 0, 0, 0, 0, 0, 0, 0, 0]
    const v = !on ? off : [DIMMER, 250, g, 0, c, a.x ?? 64, 64, a.zoom ?? 0, a.xrot ?? 0, a.yrot ?? 0, a.rot ?? 0, a.paint ?? 0, a.xwave ?? 0, 0, 0, 0, 0, 0, 0,
        g2 ?? 0, 0, c, a.x2 ?? 64, 64, a.zoom2 ?? 0, a.xrot2 ?? 0, a.yrot2 ?? 0, a.rot2 ?? 0, a.paint2 ?? 0, a.xwave2 ?? 0, 0, 0]
    if (on && RGB_MODE && DIODES[c]) { v[4] = 8; v[21] = 8; [v[15], v[16], v[17]] = DIODES[c] }
    const t = on && (!RGB_MODE || c === 8) ? TRIM.get(base) : null
    if (t) { if (t.r != null) v[15] = t.r; if (t.g != null) v[16] = t.g; if (t.b != null) v[17] = t.b }
    return v.map((value, i) => ({ universe, channel: base + i, value }))
})
let state = ''
let thenState = { key: null, at: 0, done: false }
const tick = async () => {
    const st = await (await fetch(`${desk}/api/state`)).json()
    // The scene that is ON (the 'cue' layer's look), fired by the runner or by hand, mapped to its cue number; else the runner's index.
    const onLook = (st?.layers || []).find((l) => l.id === 'cue' && l.on !== false)?.lookId
    const byLook = onLook ? (st?.cues?.list || []).findIndex((c) => c.lookId === onLook) : -1
    const i = byLook >= 0 ? byLook : st?.cues?.index
    const cue = Number.isInteger(i) && i >= 0 ? i + 1 : null
    // a look that lives only on the desk (not in the cue list) plays the plan's "look:<id>" entry (2026-10-18, Red white cool)
    const lookKey = onLook && byLook < 0 && plan[`look:${onLook}`] ? `look:${onLook}` : null
    const on = Date.now() < previewUntil || Boolean(lookKey) || (!onLook || byLook >= 0) && cue !== null && cues.has(cue)
    const q = playOf(lookKey || cue)
    const g = q.list[Math.floor(Date.now() / q.every) % q.list.length]
    // colours [a, b]: the colour changes with each picture (owner 03:3x: a white-green "gradient" — the units have no white-green blend)
    const c = q.colours ? q.colours[Math.floor(Date.now() / q.every) % q.colours.length] : q.colour
    // then {after_s, look}: a timed build — after this look has been ON for after_s, the desk's cue layer moves to the next look
    if (lookKey !== thenState.key) thenState = { key: lookKey, at: Date.now(), done: false }
    if (q.then && lookKey && !thenState.done && Date.now() - thenState.at >= q.then.after_s * 1000) {
        thenState.done = true
        await fetch(`${desk}/api/layer`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: 'cue', lookId: q.then.look, on: true }) })
        console.log(`${new Date().toISOString().slice(11, 19)} then: ${lookKey} -> ${q.then.look}`)
    }
    const L2 = q.anim.g2 || null
    const g2 = L2 && L2.length ? L2[(Math.floor(Date.now() / q.every) + Math.floor(L2.length / 2)) % L2.length] : null
    await raw(frame(on, g, c, q.anim, g2))
    const now = on ? `ON graphic ${g} colour ${c} (cue ${cue}${Date.now() < previewUntil ? ', preview' : ''})` : `dark (cue ${cue})`
    if (now !== state) { console.log(`${new Date().toISOString().slice(11, 19)} ${now}`); state = now }
}
const release = async () => {
    try { await raw(frame(false, 1, 28)); console.log('held dark (mode 250, dimmer 0), not released: the desk default ch2 = 0 is the AUTO program') } catch (e) { console.log('release failed', e.message) }
    process.exit(0)
}
process.on('SIGINT', release); process.on('SIGTERM', release)
for (;;) { try { await tick() } catch (e) { console.log('tick', e.message) } await new Promise((r) => setTimeout(r, 1000)) }
