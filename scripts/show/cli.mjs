// `di show <go | checkpoint | profile | mark>`: the router. It parses its own argv because the shared
// di parser (scripts/di/args.mjs) knows only its own value flags; this keeps the show flags in one place.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { DEFAULTS, Refusal, expandHome, listVenues, loadProfile } from './lib/profile.mjs'
import { makeTransport } from './lib/transport.mjs'
import { runCheckpoint } from './checkpoint.mjs'
import { runGo } from './go.mjs'
import { usage } from './usage.mjs'

const VALUE_FLAGS = new Set(['venue', 'host', 'user', 'api', 'di-home', 'backups', 'marker', 'soak', 'interval', 'temp-nogo', 'venues-dir', 'session', 'why'])

export function parseShowArgs(argv) {
    const args = { _: [], flags: {} }
    for (let i = 0; i < argv.length; i += 1) {
        const token = argv[i]
        if (!token.startsWith('--')) { args._.push(token); continue }
        const eq = token.indexOf('=')
        if (eq > 2) { args.flags[token.slice(2, eq)] = token.slice(eq + 1); continue }
        const name = token.slice(2)
        if (VALUE_FLAGS.has(name)) {
            const value = argv[i + 1]
            if (value === undefined || value.startsWith('--')) throw new Refusal(`--${name} needs a value`)
            args.flags[name] = value
            i += 1
            continue
        }
        args.flags[name] = true
    }
    return args
}

function mark(args, { env, print, home }) {
    const file = expandHome((typeof args.flags.marker === 'string' && args.flags.marker) || env.DI_VENUE_MARKER || DEFAULTS.markerPath, home)
    const venue = args._[1]
    if (!venue) {
        let current = ''
        try { current = fs.readFileSync(file, 'utf8').trim() } catch { /* no marker yet */ }
        print(current ? `this machine is marked "${current}" (${file})` : `this machine has no venue marker (${file})`)
        return current ? 0 : 1
    }
    const known = listVenues({ flags: args.flags, env, home }).map((v) => v.venue)
    if (!known.includes(venue)) throw new Refusal(`no profile for "${venue}" (known: ${known.join(', ') || 'none'})`)
    fs.mkdirSync(path.dirname(file), { recursive: true })
    const tmp = `${file}.tmp-${process.pid}`
    fs.writeFileSync(tmp, `${venue}\n`)
    fs.renameSync(tmp, file)
    print(`++ this machine is marked "${venue}" (${file}); undo: rm ${file}`)
    return 0
}

/** Returns the exit code. deps: { env, print, home, transportFactory, go } for tests. */
export async function main(argv, deps = {}) {
    const env = deps.env ?? process.env
    const print = deps.print ?? ((s) => process.stdout.write(`${s}\n`))
    const home = deps.home ?? os.homedir()
    try {
        const args = parseShowArgs(argv)
        const sub = args._[0]
        if (!sub || sub === 'help' || args.flags.help) { print(usage()); return sub ? 0 : 2 }
        if (sub === 'mark') return mark(args, { env, print, home })
        if (sub === 'profile' && args.flags.list) {
            const all = listVenues({ flags: args.flags, env, home })
            print(all.length ? all.map((v) => `${v.venue}  ${v.file}`).join('\n') : 'no venue profiles found')
            return 0
        }
        const profile = loadProfile({ flags: args.flags, env, home })
        if (sub === 'profile') { print(JSON.stringify(profile, null, 2)); return 0 }
        if (sub !== 'go' && sub !== 'checkpoint') { print(`!! no such show command: ${sub}`); print(usage()); return 2 }
        if (!profile.host) throw new Refusal(`profile ${profile.venue} names no machine: set "host" (or "local"), or pass --host / --local`)
        const transport = (deps.transportFactory ?? makeTransport)({ host: profile.host, user: profile.user, timeoutMs: sub === 'checkpoint' ? 180000 : 60000 })
        const session = (typeof args.flags.session === 'string' && args.flags.session) || env.DI_SESSION || null
        if (sub === 'go') {
            const { code } = await runGo({ profile, transport, mode: args.flags.look ? 'look' : 'go', why: args.flags.why || 'show go', session, print, ...(deps.go || {}) })
            return code
        }
        const why = args._.slice(1).join(' ') || (typeof args.flags.why === 'string' ? args.flags.why : '')
        if (!why) throw new Refusal('say why: di show checkpoint --venue <id> "<why>"')
        const r = await runCheckpoint({ profile, why, session, transport, home })
        if (r.code === 0) print(`++ checkpoint ${r.folder} (running ${r.version})`)
        else if (r.code === 3) print(`!! checkpoint partial (exit 3): ${r.stderrTail}\n   kept: ${r.folder}`)
        else if (r.code === 2) print(`!! REFUSED: ${r.stderrTail}`)
        else print(`!! checkpoint failed (exit ${r.code}): ${r.stderrTail}${r.folder ? `\n   see ${r.folder}/FAILED.txt` : ''}`)
        return r.code
    } catch (error) {
        if (error instanceof Refusal) { print(`!! REFUSED: ${error.message}`); return 2 }
        throw error
    }
}

/** Entry from `di show …` (scripts/di/cli.mjs): everything after the word "show". */
export async function runFromDi(argvAfterScript) {
    const at = argvAfterScript.indexOf('show')
    process.exitCode = await main(argvAfterScript.slice(at + 1))
}
