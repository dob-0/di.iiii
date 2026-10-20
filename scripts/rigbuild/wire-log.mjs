#!/usr/bin/env node
/**
 * wire-log.mjs — READ-ONLY wire logger. Polls the desk's GET /dmx and prints one line for every change of a window of channels:
 * "<ISO time> v1,v2,…". The lines are the clock that photos and videos are matched to (wire_match.py).
 * Moved from the agent's shape-log.mjs / shape-log-at.mjs (owner row N1001, 2026-10-17). Sends nothing: only GET.
 *
 *   node scripts/rigbuild/wire-log.mjs --desk <http://host/light/api> --universe <0-based key> --first <1-based channel>
 *        [--count 7] [--seconds 3600] [--interval-ms 250]
 *
 * No default address: --desk, --universe and --first are required.
 */
import { fileURLToPath } from 'node:url'
import { parseArgs, die, say } from '../place/common.mjs'

export const USAGE = 'wire-log.mjs --desk <url of …/light/api> --universe <0-based key> --first <1-based channel> [--count 7] [--seconds 3600] [--interval-ms 250]   (read-only: GET /dmx only)'

/** The window of a /dmx answer: channels first..first+count-1 (1-based) of the universe's buffer, or null when it is not there. */
export const windowOf = (body, universe, first, count) => {
    const buf = body?.dmx?.[String(universe)]
    return Array.isArray(buf) && buf.length >= first - 1 + count ? buf.slice(first - 1, first - 1 + count) : null
}

/** A change filter: returns the log line for a new window, or null when it equals the last one. */
export const makeChangeLogger = (now = () => new Date()) => {
    let last = ''
    return (win) => {
        const v = win.join(',')
        if (v === last) return null
        last = v
        return `${now().toISOString()} ${v}`
    }
}

export const main = async (argv = process.argv.slice(2), { fetchImpl = fetch, out = say, sleep = (ms) => new Promise((r) => setTimeout(r, ms)), now = () => new Date() } = {}) => {
    const args = parseArgs(argv)
    if (args.help) { out(USAGE); return 0 }
    if (!args.desk || args.universe === undefined || !args.first) die(`required: --desk --universe --first\n${USAGE}`)
    const desk = String(args.desk).replace(/\/$/, '')
    const universe = Number(args.universe)
    const first = Number(args.first)
    const count = Number(args.count ?? 7)
    const end = now().getTime() + Number(args.seconds ?? 3600) * 1000
    const log = makeChangeLogger(now)
    let lines = 0
    while (now().getTime() < end) {
        try {
            const body = await (await fetchImpl(`${desk}/dmx`)).json()
            const win = windowOf(body, universe, first, count)
            const line = win && log(win)
            if (line) { out(line); lines++ }
        } catch (e) { out(`${now().toISOString()} read failed ${e.message}`) }
        await sleep(Number(args['interval-ms'] ?? 250))
    }
    return lines
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main().then(() => process.exit(0), (e) => { console.error(e.stack || e.message); process.exit(1) })
