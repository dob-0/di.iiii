// Headless check of the APC40 full patch: a fake APC40 mkII (Web MIDI stub) drives a TEST copy of the desk
// (never the live one: output off, own data dir). Every new control is pressed and the desk state is read back.
// usage: PW_FROM=<dir with node_modules/playwright> node apc40-full-sim.mjs <desk url ending in /> <picture prefix>
import { createRequire } from 'node:module'
const require = createRequire(process.env.PW_FROM + '/')
const { chromium } = require('playwright')

const base = process.argv[2]
const shot = process.argv[3]
const api = async (p, body) => (await fetch(base + p, body ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : undefined)).json()
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const results = []
const check = (name, ok, got) => { results.push({ name, ok }); console.log((ok ? 'PASS ' : 'FAIL ') + name + '  got ' + JSON.stringify(got)) }

const browser = await chromium.launch({ headless: true })
const ctx = await browser.newContext({ viewport: { width: 1534, height: 830 } })
const page = await ctx.newPage()
const posts = []
ctx.on('response', async (r) => { if (/api\/raw/.test(r.url()) && r.request().method()==='POST') { try { const j = await r.json(); console.log('raw resp', r.status(), Object.keys(j.raw||{}).length, JSON.stringify(j.refused||j.error||'').slice(0,100)) } catch (e) { console.log('raw resp err', r.status()) } } })
ctx.on('request', (r) => { if (r.method() === 'POST' && /\/api\//.test(r.url())) posts.push(r.url().split('/api/')[1]) })
page.on('pageerror', (e) => console.log('PAGE ERROR ' + e.message))
await ctx.addInitScript(() => {
  const input = { id: 'apc', name: 'APC40 mkII', manufacturer: 'Akai', state: 'connected', type: 'input', onmidimessage: null }
  window.__led = []
  const output = { id: 'apc-out', name: 'APC40 mkII', manufacturer: 'Akai', state: 'connected', type: 'output', send: (d) => window.__led.push([...d]) }
  const access = { inputs: new Map([['apc', input]]), outputs: new Map([['apc-out', output]]), onstatechange: null, sysexEnabled: false }
  navigator.requestMIDIAccess = () => Promise.resolve(access)
  window.__midi = (bytes) => input.onmidimessage && input.onmidimessage({ data: new Uint8Array(bytes) })
})
await api('api/layer', { id: 'cue', level: 1, rate: 1 })
await page.goto(base + '#midi')
await page.waitForFunction(() => document.querySelector('#miInputs') && /APC40/.test(document.querySelector('#miInputs').textContent), null, { timeout: 15000 })
await sleep(2500)
await page.click('#miPreset')
await sleep(1200)
const flash = await page.evaluate(() => document.body.innerText.match(/Akai APC40 mkII: \d+ controls mapped/)?.[0] || null)
check('Map my controller binds 49 + 24 = 73 controls', /: 73 controls mapped/.test(flash || ''), flash)
const saved = await api('api/midi')
const keys = saved.midi.maps.map((m) => m.key)
check('map saved with the show, 73 rows', saved.midi.maps.length === 73, saved.midi.maps.length)
check('strobe is not bound (venue safety decision)', !keys.some((k) => /strobe|shutter|^ch:/.test(k)), keys.filter((k) => /strobe|shutter|^ch:/.test(k)))

const midi = async (bytes, ms = 450) => { await page.evaluate((b) => window.__midi(b), bytes); await sleep(ms) }
const cc = (ch, num, v, ms) => midi([0xb0 | (ch - 1), num, v], ms)
const on = (ch, num, ms) => midi([0x90 | (ch - 1), num, 0x7f], ms)
const off = (ch, num, ms) => midi([0x80 | (ch - 1), num, 0], ms)
const st = () => api('api/state')
const byU = (s, u) => s.fixtures.filter((f) => f.universe === u)
const mean = (xs) => xs.reduce((a, b) => a + b, 0) / (xs.length || 1)
const dimOf = (s, u) => mean(byU(s, u).map((f) => f.values.dimmer))
const ledNow = () => page.evaluate(() => window.__led.map((m) => m.slice()))

// ---- Safe: nothing is sent ----
const s0 = await st()
const p0 = posts.length
for (const [ch, n] of [[1, 0x32], [1, 0x63], [1, 0x66], [1, 0x67], [1, 0x3e], [1, 0x5a]]) { await on(ch, n, 150); await off(ch, n, 100) }
await cc(1, 7, 10, 100); await cc(1, 13, 1, 100); await cc(1, 53, 5, 100)
await sleep(500)
const s1 = await st()
check('Safe: every new control pressed, nothing posted, nothing moved', posts.length === p0 && JSON.stringify(s1.fixtures.map((f) => f.on)) === JSON.stringify(s0.fixtures.map((f) => f.on)) && s1.fx.bpm === s0.fx.bpm && !Object.keys(s1.raw).length, { posts: posts.length - p0 })

await page.click('#miArm')
await sleep(500)

// ---- 1. group dimmers ----
const d0 = [dimOf(s0, 5), dimOf(s0, 4), mean([...byU(s0, 2), ...byU(s0, 3)].map((f) => f.values.dimmer))]
await cc(1, 7, 127, 150); await cc(1, 7, 64, 700)    // takeover: cross the desk value, then settle at 64
let s = await st()
check('fader 1 = Left truss dimmer (universe 5 ~ 129), the others untouched', Math.abs(dimOf(s, 5) - 129) <= 2 && dimOf(s, 4) === d0[1], { left: dimOf(s, 5), right: dimOf(s, 4), was: d0 })
await cc(2, 7, 127, 150); await cc(2, 7, 32, 700)
s = await st()
check('fader 2 = Right truss dimmer (universe 4 ~ 64), left stays', Math.abs(dimOf(s, 4) - 64.5) <= 2 && Math.abs(dimOf(s, 5) - 129) <= 2, { right: dimOf(s, 4), left: dimOf(s, 5) })
await cc(3, 7, 127, 150); await cc(3, 7, 96, 700)
s = await st()
const backDim = mean([...byU(s, 2), ...byU(s, 3)].map((f) => f.values.dimmer))
check('fader 3 = Back bars dimmer (universes 2+3 ~ 193), trusses stay', Math.abs(backDim - 193) <= 2 && Math.abs(dimOf(s, 4) - 64.5) <= 2, { back: backDim })

// ---- 1b. on/off + LED ----
const ledsFrom = async (n) => (await ledNow()).slice(n).filter((m) => m[1] === 0x32)
let n0 = (await ledNow()).length
await on(1, 0x32, 700); await off(1, 0x32, 100)
s = await st()
check('activator 1: Left truss off (9 of 9), right and back stay on', byU(s, 5).every((f) => f.on === false) && byU(s, 4).every((f) => f.on !== false) && byU(s, 2).every((f) => f.on !== false), { left: byU(s, 5).map((f) => f.on) })
let L = await ledsFrom(n0)
check('activator 1 LED goes dark on channel 0x90 (track 1)', L.some((m) => m[0] === 0x90 && m[2] === 0), L)
n0 = (await ledNow()).length
await on(1, 0x32, 700); await off(1, 0x32, 100)
s = await st()
L = await ledsFrom(n0)
check('pressed again: Left truss on, LED lit', byU(s, 5).every((f) => f.on !== false) && L.some((m) => m[0] === 0x90 && m[2] === 1), L)
await on(2, 0x32, 700); await on(3, 0x32, 700)
s = await st()
check('activators 2 and 3: Right truss and Back bars off, LEDs on tracks 2 and 3 dark', byU(s, 4).every((f) => f.on === false) && [...byU(s, 2), ...byU(s, 3)].every((f) => f.on === false), 'ok')
L = await ledsFrom(n0)
check('LED channels 0x91 and 0x92 both went dark', L.some((m) => m[0] === 0x91 && m[2] === 0) && L.some((m) => m[0] === 0x92 && m[2] === 0), L)
await on(2, 0x32, 600); await on(3, 0x32, 600)   // back on

// ---- 2. layer level and rate ----
await cc(7, 7, 0, 150); await cc(7, 7, 127, 150); await cc(7, 7, 63, 700)
s = await st()
const lay = s.layers.find((l) => l.id === 'cue')
check('fader 7 = layer Cues level (~0.5)', Math.abs(lay.level - 63 / 127) < 0.02, lay.level)
await cc(1, 53, 0, 150); await cc(1, 53, 64, 700)
s = await st()
check('track knob 6 = layer rate on a log taper (64/127 ~ 1.0x)', Math.abs(s.layers.find((l) => l.id === 'cue').rate - 1.02) < 0.05, s.layers.find((l) => l.id === 'cue').rate)
await cc(1, 53, 127, 150); await sleep(300)
check('knob to the end = 8x (desk accepts up to 64)', (await st()).layers.find((l) => l.id === 'cue').rate === 8, (await st()).layers.find((l) => l.id === 'cue').rate)

// ---- 3. tap, nudge, relative tempo ----
const tapAt = Date.now()
await on(1, 0x63, 100); await off(1, 0x63, 400)
await on(1, 0x63, 100); await off(1, 0x63, 600)
s = await st()
check('tap tempo twice 500 ms apart: BPM ~120 and the beat set to the tap', s.fx.bpm >= 115 && s.fx.bpm <= 125 && Math.abs(s.fx.epoch - (tapAt + 500)) < 400, { bpm: s.fx.bpm, epoch: s.fx.epoch - tapAt })
const e0 = s.fx.epoch
await on(1, 0x65, 500); await off(1, 0x65, 50)
s = await st()
check('nudge + moves the beat later by 25 ms', s.fx.epoch - e0 === 25, s.fx.epoch - e0)
await on(1, 0x64, 500); await on(1, 0x64, 500)
s = await st()
check('nudge - twice moves it earlier by 50 ms', s.fx.epoch - e0 === -25, s.fx.epoch - e0)
const b0 = s.fx.bpm
await cc(1, 13, 3, 600)
s = await st()
check('tempo knob up 3 clicks = +3 BPM (no takeover)', s.fx.bpm === b0 + 3, [b0, s.fx.bpm])
await cc(1, 13, 127, 500)
s = await st()
check('tempo knob down 1 click (127) = -1 BPM', s.fx.bpm === b0 + 2, [b0, s.fx.bpm])
await cc(1, 13, 128 - 63, 500)
s = await st()
check('tempo knob 65 = down 63 clicks', s.fx.bpm === Math.max(20, b0 + 2 - 63), s.fx.bpm)

// ---- 4. zoom and colour effect ----
const zoomers = (x) => x.fixtures.filter((f) => f.values.zoom != null)
const nz = zoomers(s).length
await cc(6, 7, 0, 150); await cc(6, 7, 100, 800)
s = await st()
check(`fader 6 = zoom on the ${nz} fixtures that have one (100/127 = 201)`, nz > 0 && zoomers(s).every((f) => Math.abs(f.values.zoom - 201) <= 1 && (f.values.zoom2 == null || Math.abs(f.values.zoom2 - 201) <= 1)), zoomers(s).map((f) => f.values.zoom).slice(0, 4))
check('fixtures without a zoom channel are untouched', s.fixtures.filter((f) => f.values.zoom == null).every((f) => f.values.zoom === undefined), 'ok')
await cc(8, 7, 0, 150); await cc(8, 7, 127, 150); await cc(8, 7, 64, 700)
s = await st()
check('fader 8 = colour FX amount (64/127 ~ 129)', Math.abs(s.colorFx.amount - 128) <= 2, s.colorFx.amount)
await cc(1, 54, 0, 200); await cc(1, 54, 90, 700)
s = await st()
check('track knob 7 = colour FX beats on 1 2 4 8 16 32 (90/127 -> 16)', s.colorFx.beats === 16, s.colorFx.beats)
await cc(1, 55, 0, 200); await cc(1, 55, 127, 200); await cc(1, 55, 32, 700)
s = await st()
check('track knob 8 = colour FX spread (32/127 ~ 0.25)', Math.abs(s.colorFx.spread - 0.252) < 0.02, s.colorFx.spread)
await cc(1, 47, 1, 600)
s = await st()
check('cue level knob up = colour FX mode none -> hue', s.colorFx.mode === 'hue', s.colorFx.mode)
await cc(1, 47, 1, 600); await cc(1, 47, 1, 600); await cc(1, 47, 1, 600)
s = await st()
check('three more clicks stop at the last mode (swap), no wrap', s.colorFx.mode === 'swap', s.colorFx.mode)
await cc(1, 47, 127, 600)
s = await st()
check('knob down = chase', s.colorFx.mode === 'chase', s.colorFx.mode)
await on(1, 0x5a, 600)
s = await st()
check('metronome = colour FX off', s.colorFx.mode === 'none', s.colorFx.mode)
await on(1, 0x5a, 600)
s = await st()
check('metronome again = back to the last mode (chase)', s.colorFx.mode === 'chase', s.colorFx.mode)
check('colour pair untouched: no green is ever chosen here', s.colorFx.a === '#ff0000' && s.colorFx.b === '#00d2ff', [s.colorFx.a, s.colorFx.b])
await on(1, 0x5a, 500)   // off again

// ---- 5. hold-to-flash ----
const held = (x) => Object.entries(x.raw).filter(([k]) => x.rawOwners && x.rawOwners[k] === 'apc40')
await on(1, 0x3f, 700)
s = await st()
let h = held(s)
const lefts = byU(s, 5).length
check('hit Left truss (0x3F) held: raw holds on universe 5 only, owner apc40', h.length > 0 && h.every(([k, v]) => k.startsWith('5:') && v === 255) && Object.keys(s.raw).length === h.length, { n: h.length, fixtures: lefts })
await off(1, 0x3f, 700)
s = await st()
check('released: no hold left', Object.keys(s.raw).length === 0, Object.keys(s.raw).length)
await on(1, 0x40, 700)
s = await st()
h = held(s)
check('hit Right truss (0x40): universe 4 only', h.length > 0 && h.every(([k]) => k.startsWith('4:')), h.length)
await off(1, 0x40, 700)
await on(1, 0x3e, 900)
s = await st()
h = held(s)
console.log('posts: ' + posts.slice(-4).join(',') + ' | '+ JSON.stringify(await page.evaluate(() => ({armed: window.midiArmed, held: typeof midiHeld!=='undefined' ? [...midiHeld.keys()] : null})))); console.log('white: raw ' + Object.keys(s.raw).length + ' owners ' + JSON.stringify(s.rawOwners).slice(0, 80))
const us = new Set(h.map(([k]) => k.split(':')[0]))
check('hit white (0x3E): every universe of the rig, strobe untouched', [...us].sort().join() === '2,3,4,5', [...us])
check('a hold never touches a strobe channel', (() => { const strobeKeys = new Set(); for (const f of s.fixtures) { const p = s.profiles[f.profile]; (p.channels || []).forEach((r, i) => { if (/strobe/.test(r)) strobeKeys.add(`${f.universe}:${f.address + i}`) }) } return h.every(([k]) => !strobeKeys.has(k)) })(), 'ok')
await off(1, 0x3e, 700)
check('white released', Object.keys((await st()).raw).length === 0, Object.keys((await st()).raw).length)
await on(1, 0x41, 700)
s = await st()
check('hit swap (0x41) held: colour FX swap at full amount', s.colorFx.mode === 'swap' && s.colorFx.amount === 255, [s.colorFx.mode, s.colorFx.amount])
await off(1, 0x41, 700)
s = await st()
check('released: colour FX back to what it was (none, amount 128)', s.colorFx.mode === 'none' && Math.abs(s.colorFx.amount - 128) <= 2, [s.colorFx.mode, s.colorFx.amount])
// Disarm while a hit is held: it lets go before the gate closes.
await on(1, 0x3e, 600)
const heldNow = Object.keys((await st()).raw).length
await page.click('#miArm')
await sleep(900)
check('a hit held while the page goes Safe is released', heldNow > 0 && Object.keys((await st()).raw).length === 0, { held: heldNow })
await page.click('#miArm')
await sleep(500)
await off(1, 0x3e, 300)
check('the late note-off after that does nothing', Object.keys((await st()).raw).length === 0, 'ok')

// ---- 6. blackout release and panic ----
await on(1, 0x56, 700)
check('SCENE LAUNCH 5 = blackout on', (await st()).blackout === true, (await st()).blackout)
n0 = (await ledNow()).length
await on(1, 0x66, 700)
check('SESSION RECORD = blackout release (off)', (await st()).blackout === false, (await st()).blackout)
await on(1, 0x66, 700)
check('release when already live stays live (always off, never a toggle)', (await st()).blackout === false, (await st()).blackout)
await api('api/fx', { mode: 'pulse', enabled: true }); await api('api/cues/go', {})
await sleep(2600)
s = await st()
const before = { chase: s.chase.enabled, fx: s.fx.enabled, cue: (await api('api/cues')).cues.running }
await on(1, 0x67, 1200)
s = await st()
const after = { black: s.blackout, chase: s.chase.enabled, fx: s.fx.enabled, cue: (await api('api/cues')).cues.running }
check('BANK LOCK = panic: blackout on, FX off, cues stopped (chase has no scenes in this show: its off is unit-tested)', before.fx && after.black === true && !after.chase && !after.fx && !after.cue, { before, after })
await on(1, 0x66, 700)

// ---- pictures: the MIDI pane at two real sizes ----
await page.evaluate(() => { const t = document.querySelector('#miMapBody tr[data-key="grp:left:dim"]'); t && t.scrollIntoView({ block: 'start' }); window.scrollBy(0, -170) })
await sleep(300)
await page.screenshot({ path: shot + '-1534x830-table.png' })
await page.evaluate(() => { const t = document.querySelector('#miMapBody tr[data-key="hit:white"]'); t && t.scrollIntoView({ block: 'start' }); window.scrollBy(0, -170) })
await sleep(300)
await page.screenshot({ path: shot + '-1534x830-hits.png' })
await page.evaluate(() => window.scrollTo(0, 0))
await sleep(300)
await page.screenshot({ path: shot + '-1534x830-top.png' })
await page.setViewportSize({ width: 1536, height: 864 })
await sleep(500)
await page.screenshot({ path: shot + '-1536x864-top.png' })
const rows = await page.evaluate(() => [...document.querySelectorAll('#miMapBody tr[data-key]')].filter((r) => !/^ch:/.test(r.dataset.key) && /grp:|layer|tap|nudge|tempo|^zoom|cfx|hit:|blackoutoff|panic/.test(r.dataset.key)).map((r) => [r.dataset.key, r.children[1].textContent.trim()]))
console.log('new rows in the mapping table: ' + rows.length + ' ' + JSON.stringify(rows.slice(0, 30)))
check('mapping table shows 24 new rows, each with a ch/CC or ch/note', rows.length === 24 && rows.every(([, b]) => /(ch\d+\s+(CC|note) \d+|catch)/.test(b)), rows.length)

await browser.close()
const fails = results.filter((r) => !r.ok).length
console.log(`${results.length - fails} of ${results.length} checks passed`)
process.exit(fails ? 1 : 0)
