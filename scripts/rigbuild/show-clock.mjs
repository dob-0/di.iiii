#!/usr/bin/env node
/**
 * show-clock.mjs — start (or stop) a project's show on the WALL CLOCK, so a hosted tier plays
 * it with no desk. docs/architecture/RIG_BUILD.md §16 (hosted playback), src/rigbuild/showClock.js.
 *
 *   node scripts/rigbuild/show-clock.mjs --api https://dev.diiii.xyz/serverXR --project moxir-hall-minimal \
 *       [--epoch now|<ISO time>|<ms>] [--dry-run]
 *   node scripts/rigbuild/show-clock.mjs … --off        # the room goes back to the document as saved
 *   node scripts/rigbuild/show-clock.mjs … --check      # read only: where the show is right now
 *
 * What it writes: ONE op, `setMappingState {showEpoch}` (and `loop: true` unless --no-loop), at
 * the project's current documentVersion — the op log is what every viewer replays, so a bare
 * document write would be invisible. The cue list itself (mappingState.cues) is not touched:
 * program it first (show-loop.mjs, or the cards page). The script refuses a project whose cue
 * list fires no rig look, and prints the timeline it will play.
 *
 * The token: DI_API_TOKEN in the environment, or --token-file <file with ADMIN_API_TOKEN= /
 * API_TOKEN= / LIVE_API_TOKEN=>. Production (diiii.xyz, di-studio.xyz) is refused without
 * --allow-production — prod only on the owner's word.
 */
import fs from 'node:fs'
import path from 'node:path'

import { parseArgs, die, say } from '../place/common.mjs'
import { makeClient } from '../place/api.mjs'
import { showOf, showStateAt, showTimeline, showWords } from '../../src/rigbuild/showClock.js'
import { isMainModule } from '../lib/isMainModule.mjs'

const PROD_HOSTS = /(^|\.)(diiii\.xyz|di-studio\.xyz)$/

/** --epoch → ms since 1970 UTC. Pure (now passed in). */
export const parseEpoch = (value, now) => {
    if (value === undefined || value === true || value === 'now') return now
    if (/^\d{12,}$/.test(String(value))) return Number(value)
    const t = Date.parse(String(value))
    if (!Number.isFinite(t)) throw new Error(`--epoch: not a time: ${value}`)
    return t
}

/** The op(s) this writes. Pure. */
export const clockOps = ({ epoch, loop = true, off = false }) => [
    { type: 'setMappingState', payload: { patch: off ? { showEpoch: null } : { showEpoch: epoch, ...(loop ? { loop: true } : {}) } } }
]

/** Refuses a production host unless allowed. Pure. */
export const isProductionApi = (api) => {
    try {
        const host = new URL(api).hostname
        return PROD_HOSTS.test(host) && !host.startsWith('dev.')
    } catch { return false }
}

const tokenFrom = (file) => {
    if (process.env.DI_API_TOKEN) return process.env.DI_API_TOKEN.trim()
    if (!file) return null
    const text = fs.readFileSync(path.resolve(String(file)), 'utf8')
    for (const key of ['ADMIN_API_TOKEN', 'API_TOKEN', 'LIVE_API_TOKEN']) {
        const line = text.split('\n').find((l) => l.startsWith(`${key}=`))
        if (line && line.slice(key.length + 1).trim()) return line.slice(key.length + 1).trim()
    }
    return null
}

const main = async () => {
    const args = parseArgs()
    const api = args.api ? String(args.api).replace(/\/+$/, '') : die('needs --api <base>/serverXR — no default on purpose')
    const project = args.project ? String(args.project) : die('needs --project <id>')
    if (isProductionApi(api) && !args['allow-production']) die(`${api} is production — refused without --allow-production (prod only on the owner's word)`)
    const token = tokenFrom(args['token-file'])
    const client = makeClient(api, token)

    const doc = await client.get(`/api/projects/${encodeURIComponent(project)}/document`)
    if (!doc.ok) die(`reading ${project}: ${doc.status} ${doc.text.slice(0, 200)}`)
    const document = doc.body.document
    const version = doc.body.version

    if (args.check) {
        const show = showOf(document)
        if (!show) { say(`${project}: no show on the clock (showEpoch ${document.mappingState?.showEpoch ?? 'unset'}, ${document.mappingState?.cues?.length || 0} cues)`); return }
        say(`${project}: ${showWords(showStateAt(show, Date.now()), show)} — epoch ${new Date(show.epoch).toISOString()}`)
        return
    }

    const off = Boolean(args.off)
    const epoch = off ? null : parseEpoch(args.epoch, Date.now())
    const loop = !args['no-loop']
    if (!off) {
        const show = showOf({ mappingState: { ...document.mappingState, showEpoch: epoch, ...(loop ? { loop: true } : {}) } })
        if (!show) die(`${project}'s cue list fires no rig look — program it first (show-loop.mjs or the cards page)`)
        const line = showTimeline(show)
        say(`${project}: ${line.steps.map((s) => `${s.name} ${s.holdMs / 1000} s`).join(' → ')}${line.loops ? ` → (loop, ${line.lengthMs / 1000} s a pass)` : ' (plays once)'}`)
        say(`epoch ${new Date(epoch).toISOString()}`)
    }
    const ops = clockOps({ epoch, loop, off })
    if (args['dry-run']) { say(`dry run: would write ${JSON.stringify(ops)} at version ${version}`); return }
    if (!token) die('no token: set DI_API_TOKEN or --token-file')
    const wrote = await client.post(`/api/projects/${encodeURIComponent(project)}/ops`, {
        baseVersion: version,
        ops: ops.map((op, i) => ({ ...op, opId: `show-clock-${Date.now()}-${i}`, clientId: 'show-clock' }))
    })
    if (!wrote.ok) die(`writing: ${wrote.status} ${wrote.text.slice(0, 300)}`)
    say(`${off ? 'show clock off' : 'show clock on'} — ${project} version ${wrote.body?.newVersion ?? '?'}`)
}

if (isMainModule(import.meta.url)) {
    main().catch((error) => die(error.stack || error.message))
}
