#!/usr/bin/env node
/**
 * laser-axis-loop.mjs — test loop for ONE two-axis laser on the light desk's raw API: X sweeps min→max→min in one colour, then Y in
 * another (the other axis held at `--hold`), so a camera sees a dot move along one axis at a time. WRITES to a real lamp.
 * Moved from an agent's laser sweep script (owner row N1001, 2026-10-17). What changed: no address is built in (every target is an
 * argument), nothing is sent unless --send is given (default: a dry run that prints the plan), and the bytes found at the start
 * are put back at the end, on time-out, on SIGINT / SIGTERM and when a write fails.
 *
 *   node scripts/rigbuild/laser-axis-loop.mjs --desk <…/light/api> --read <url of a GET that answers {dmx:{"<u>":[…]}}>
 *        --universe <0-based> --first <1-based channel of the lamp's dimmer> --dimmer-ch <offset> --colour-ch <offset>
 *        --x-ch <offset> --y-ch <offset> --x-colour <v> --y-colour <v> [--max 125] [--hold 64] [--steps 40] [--step-ms 100]
 *        [--seconds 600] [--open "offset=value,offset=value"] [--other-dimmer <1-based channel of a lamp to blank>] [--send]
 *
 * Offsets are 0-based from --first. --open lists the channels set once at the start (dimmer, shutter, mode…) so the lamp shows
 * the dot. --read is usually the desk's own GET /dmx or the node's. Everything restored = every channel this tool writes.
 */
import { fileURLToPath } from 'node:url'
import { parseArgs, die, say } from '../place/common.mjs'

export const USAGE = 'laser-axis-loop.mjs --desk <url> --read <url> --universe <n> --first <ch> --dimmer-ch <off> --colour-ch <off> --x-ch <off> --y-ch <off> --x-colour <v> --y-colour <v> [--max 125] [--hold 64] [--steps 40] [--step-ms 100] [--seconds 600] [--open off=v,off=v] [--other-dimmer <ch>] [--send]   (without --send: dry run, nothing is written)'

const REQUIRED = ['desk', 'read', 'universe', 'first', 'dimmer-ch', 'colour-ch', 'x-ch', 'y-ch', 'x-colour', 'y-colour']

/** "4=255,5=250" → [[4,255],[5,250]]; throws on nonsense or values outside 0-255. */
export const parseOpen = (spec) => {
    if (spec == null || spec === true || spec === '') return []
    return String(spec).split(',').map((p) => {
        const m = /^\s*(\d+)\s*=\s*(\d+)\s*$/.exec(p)
        if (!m || Number(m[2]) > 255) throw new Error(`--open: cannot read "${p.trim()}" (use offset=value, value 0-255)`)
        return [Number(m[1]), Number(m[2])]
    })
}

/** The universe's buffer from a /dmx answer: its own key, or the only one (a node answers one buffer under its own port key). */
export const bufferOf = (body, universe) => {
    const d = body?.dmx || {}
    const buf = d[String(universe)] ?? (Object.keys(d).length === 1 ? Object.values(d)[0] : null)
    if (!Array.isArray(buf)) throw new Error(`--read answered no buffer for universe ${universe} (keys ${Object.keys(d)})`)
    return buf
}

/** One axis, one pass: values min→max→min in `steps` steps each way (the endpoints once). */
export const axisValues = (max, steps) => {
    const up = Array.from({ length: steps + 1 }, (_, i) => Math.round((max * i) / steps))
    return [...up, ...up.slice(0, -1).reverse()]
}

/** The writes of one step: colour channel, the swept channel, the held channel. Absolute 1-based channels. */
export const stepWrites = ({ first, colourCh, sweepCh, holdCh, colour, value, hold }) => [
    [first + colourCh, colour], [first + sweepCh, value], [first + holdCh, hold],
]

/** Build the validated plan from args (all addresses explicit). */
export const planOf = (args) => {
    const miss = REQUIRED.filter((k) => args[k] === undefined || args[k] === true)
    if (miss.length) throw new Error(`required: ${miss.map((k) => `--${k}`).join(' ')}`)
    const n = (k, d) => { const v = Number(args[k] ?? d); if (!Number.isFinite(v)) throw new Error(`--${k} is not a number`); return v }
    const p = {
        universe: n('universe'), first: n('first'), dimmerCh: n('dimmer-ch'), colourCh: n('colour-ch'), xCh: n('x-ch'), yCh: n('y-ch'),
        xColour: n('x-colour'), yColour: n('y-colour'), max: n('max', 125), hold: n('hold', 64), steps: n('steps', 40), stepMs: n('step-ms', 100),
        seconds: n('seconds', 600), open: parseOpen(args.open), otherDimmer: args['other-dimmer'] === undefined ? null : n('other-dimmer'),
    }
    for (const k of ['xColour', 'yColour', 'max', 'hold']) if (p[k] < 0 || p[k] > 255) throw new Error(`${k} must be 0-255`)
    if (p.steps < 1 || p.stepMs < 20) throw new Error('--steps >= 1 and --step-ms >= 20')
    if (new Set([p.dimmerCh, p.colourCh, p.xCh, p.yCh]).size !== 4) throw new Error('--dimmer-ch, --colour-ch, --x-ch, --y-ch must differ')
    const ch = (off) => p.first + off
    p.touched = [...new Set([ch(p.dimmerCh), ch(p.colourCh), ch(p.xCh), ch(p.yCh), ...p.open.map(([o]) => ch(o)), ...(p.otherDimmer ? [p.otherDimmer] : [])])]
    return p
}

/**
 * Run the loop with injected I/O (so a test can use a fake desk). read() → the universe's buffer; post([[channel, value]…]);
 * sleep(ms); now() → ms. Restores in `finally` and on abort(). Returns { cycles, restored, writes }.
 */
export const runLoop = async (p, { read, post, sleep, now = Date.now, log = () => {}, isAborted = () => false }) => {
    const found = await read()
    const slot = (c) => found[c - 1]
    const saved = p.touched.map((c) => [c, slot(c)])
    log(`found ${JSON.stringify(saved)}`)
    let writes = 0
    const send = async (w) => { writes++; await post(w) }
    let cycles = 0
    try {
        await send([...p.open.map(([o, v]) => [p.first + o, v]), [p.first + p.dimmerCh, 255], ...(p.otherDimmer ? [[p.otherDimmer, 0]] : [])])
        const end = now() + p.seconds * 1000
        const sweep = async (sweepCh, holdCh, colour) => {
            for (const value of axisValues(p.max, p.steps)) {
                if (isAborted()) return
                await send(stepWrites({ first: p.first, colourCh: p.colourCh, sweepCh, holdCh, colour, value, hold: p.hold }))
                await sleep(p.stepMs)
            }
        }
        while (!isAborted() && now() < end) {
            await sweep(p.xCh, p.yCh, p.xColour)
            await sweep(p.yCh, p.xCh, p.yColour)
            cycles++
            if (cycles % 5 === 0) log(`cycles ${cycles}`)
        }
    } finally {
        await post(saved)   // the exact bytes found at the start, every channel this run wrote
    }
    const after = await read()
    const restored = saved.every(([c, v]) => after[c - 1] === v)
    log(`restored ${restored ? 'ok' : 'DIFFERS'}`)
    return { cycles, restored, writes }
}

export const main = async (argv = process.argv.slice(2)) => {
    const args = parseArgs(argv)
    if (args.help) { say(USAGE); return 0 }
    let p
    try { p = planOf(args) } catch (e) { die(`${e.message}\n${USAGE}`) }
    const desk = String(args.desk).replace(/\/$/, '')
    if (args.send !== true) {
        say(`dry run (no --send): would write channels ${p.touched.join(',')} of universe ${p.universe} via ${desk}/raw for ${p.seconds} s; X pass ${axisValues(p.max, p.steps).length} steps, then Y; restore of the found bytes at the end.`)
        say(`first step: ${JSON.stringify(stepWrites({ first: p.first, colourCh: p.colourCh, sweepCh: p.xCh, holdCh: p.yCh, colour: p.xColour, value: 0, hold: p.hold }))}`)
        return 0
    }
    let aborted = false
    for (const s of ['SIGINT', 'SIGTERM']) process.once(s, () => { aborted = true })
    const post = async (chs) => {
        const r = await fetch(`${desk}/raw`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ channels: chs.map(([channel, value]) => ({ universe: p.universe, channel, value })) }) })
        if (!r.ok) throw new Error(`raw ${r.status} ${(await r.text()).slice(0, 200)}`)
    }
    const read = async () => bufferOf(await (await fetch(String(args.read))).json(), p.universe)
    const res = await runLoop(p, { read, post, sleep: (ms) => new Promise((r) => setTimeout(r, ms)), log: (m) => say(new Date().toTimeString().slice(0, 8), m), isAborted: () => aborted })
    return res.restored ? 0 : 1
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main().then((c) => process.exit(c), (e) => { console.error(e.stack || e.message); process.exit(1) })
