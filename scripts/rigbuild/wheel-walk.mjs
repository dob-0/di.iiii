#!/usr/bin/env node
/**
 * wheel-walk.mjs — step every lamp of one type through its colour wheel, so a person (or a camera) can name each slot.
 *
 *   node scripts/rigbuild/wheel-walk.mjs --profile "<desk profile>" [--desk http://diiii.localhost/light] \
 *       [--slots 0,12,22,…] [--hold 5] [--gap 2] [--universe <0-based>] [--release]
 *
 * For a wheel the maker numbers without naming (UP-B380F ch 9: "colour 1 … colour 13"), the colours are only known by
 * looking. The walk holds, on every fixture with that profile, through the desk's manual channels (POST /api/raw —
 * they win over the running show and are released at the end): dimmer full, strobe open, gobo/prisms out, and the wheel
 * at each slot value for --hold seconds, dark for --gap seconds between slots. A 4 s dark lead-in marks the start.
 * Every step is printed with its clock time, so a film of the rig can be matched slot by slot.
 * Only the channels it set are released (value -1); other manual channels stay as they were. --release: release only.
 * Default slots: 0 (white) then the middle of each 5-wide slot 10–14 … 130–134 (the B380F chart, docs/moxir/devices/up-b380f.md).
 */
import { parseArgs, die, say } from '../place/common.mjs'

const OPEN_VALUES = { strobe: 255 } // the chart's "open" (B380F ch 7: 252–255 open)

export const defaultSlots = () => [0, ...Array.from({ length: 13 }, (_, i) => 12 + 10 * i)]

/** The channel number (1-based) of a role in a profile's channel list, or null. Pure. */
export const channelOf = (channels, role, address) => {
    const i = channels.indexOf(role)
    return i < 0 ? null : address + i
}

const main = async () => {
    const args = parseArgs()
    const profile = args.profile ? String(args.profile) : die('wheel-walk.mjs needs --profile "<desk profile name>".')
    const desk = String(args.desk || 'http://diiii.localhost/light').replace(/\/$/, '')
    const state = await (await fetch(`${desk}/api/state`)).json()
    const P = state.profiles || {}
    const channels = (Array.isArray(P) ? P.find((p) => p.name === profile) : P[profile])
    const list = channels?.channels || channels
    if (!Array.isArray(list)) die(`no desk profile "${profile}"`)
    const fixtures = state.fixtures.filter((f) => f.profile === profile && (args.universe == null || f.universe === Number(args.universe)))
    if (!fixtures.length) die(`no fixture with profile "${profile}"`)
    const raw = (channels) => fetch(`${desk}/api/raw`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ channels }) })
    const cells = (role, value) => fixtures.map((f) => ({ universe: f.universe, channel: channelOf(list, role, f.address), value })).filter((c) => c.channel)
    const roles = ['dimmer', 'strobe', 'color', 'gobo', 'prism', 'aux1', 'frost']
    const release = () => raw(roles.flatMap((r) => cells(r, -1)))
    if (args.release) { await release(); return say(`released ${roles.join(', ')} on ${fixtures.length} fixtures`) }
    // --set <value>: hold the wheel at one value, lamps full and open, until --release (calibrating by eye, one slot at a time).
    if (args.set != null) {
        const v = Number(args.set)
        await raw([...cells('strobe', OPEN_VALUES.strobe), ...cells('gobo', 0), ...cells('prism', 0), ...cells('aux1', 0), ...cells('frost', 0), ...cells('color', v), ...cells('dimmer', 255)])
        return say(`holding wheel ${v} on ${fixtures.length} fixtures — --release gives them back to the show`)
    }
    const slots = args.slots ? String(args.slots).split(',').map(Number) : defaultSlots()
    const hold = Number(args.hold) || 5
    const gap = Number(args.gap) || 2
    const wait = (s) => new Promise((r) => setTimeout(r, s * 1000))
    const stamp = () => new Date().toTimeString().slice(0, 8)
    say(`${fixtures.length} fixtures (${profile}), universes ${[...new Set(fixtures.map((f) => f.universe + 1))].join(', ')}; slots ${slots.join(' ')}; ${hold}s on, ${gap}s dark`)
    let stopping = false
    process.on('SIGINT', () => { stopping = true })
    try {
        await raw([...cells('dimmer', 0), ...cells('strobe', OPEN_VALUES.strobe), ...cells('gobo', 0), ...cells('prism', 0), ...cells('aux1', 0), ...cells('frost', 0)])
        say(`${stamp()} dark lead-in 4 s`)
        await wait(4)
        for (const [i, v] of slots.entries()) {
            if (stopping) break
            await raw([...cells('color', v), ...cells('dimmer', 255)])
            say(`${stamp()} step ${i} — wheel ${v}${v === 0 ? ' (white)' : ` (colour ${Math.round((v - 12) / 10) + 1})`}`)
            await wait(hold)
            await raw(cells('dimmer', 0))
            await wait(gap)
        }
    } finally {
        await release()
        say(`${stamp()} released — the show has the lamps again`)
    }
}

main().catch((error) => die(error.message))
