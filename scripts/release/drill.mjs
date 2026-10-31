#!/usr/bin/env node
// scripts/release/drill.mjs — the timed rollback drill, N -> N-1 -> N, on a REPLICA DI home on this machine.
//
//   node scripts/release/drill.mjs --home <replica DI home> --production <name> --base <full pack> --overlay <pack>
//        [--laser-url <http://…>]
//
// Steps, each timed and checked by its label: install the base pack (N-1), hot-swap the overlay (N), keep the
// manifest (what a checkpoint keeps), roll back N -> N-1 (undo), forward N-1 -> N (the kept overlay bundle), and a
// full restore from the manifest. The laser state is read before every step from --laser-url when a server serves the
// replica; without one the line says "not read". Results: <DI_SHOW_DIR>/<production>/drills.log (one JSON line per
// drill) and a table here. The replica uses scripts/release/replica-update.mjs, so `npm ci`, the smoke test and the
// service restart of a real `di update` are NOT in these times (stated in every result line).
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
    EXIT, REPLICA_UPDATE, UsageError, appendJsonl, b64, buildBundle, isoNow, main, packVersion, parseArgs,
    productionDir, restoreFromManifest, runTarget, say, sha256File, stamp, who
} from './lib.mjs'

const laserState = async (url) => {
    if (!url) return 'not read: no server on the replica (give --laser-url)'
    try {
        const res = await fetch(`${url.replace(/\/$/, '')}/serverXR/laser/api/state`, { signal: AbortSignal.timeout(4000) })
        if (!res.ok) return `not read (${res.status})`
        const c = ((await res.json()).cubes || [{}])[0]
        return `armed ${c.armed}, stop ${c.stop?.reason ?? null}`
    } catch (error) { return `not read (${error.message})` }
}

main(async () => {
    const { flags } = parseArgs(process.argv.slice(2))
    const production = flags.production || process.env.DI_SHOW_PRODUCTION
    const dir = productionDir(production)
    if (!flags.home || !flags.base || !flags.overlay?.length) throw new UsageError('drill.mjs --home <replica> --production <name> --base <full pack> --overlay <pack>')
    const home = path.resolve(flags.home)
    if (home === path.join(os.homedir(), '.di')) throw new UsageError('a drill runs on a replica, never on the installed di')
    const base = path.resolve(flags.base)
    const overlay = path.resolve(flags.overlay[0])
    process.env.DI_SHOW_UPDATE_CMD ||= `${process.execPath} ${REPLICA_UPDATE} --home {home} --from {pack}`
    const target = { kind: 'local', home, label: `replica ${home}` }
    fs.mkdirSync(path.join(home, 'scratch'), { recursive: true })
    const label = async () => (await runTarget(target, ['label'], { quiet: true })).stdout.trim()
    const steps = []
    const step = async (name, fn, want) => {
        const laser = await laserState(flags['laser-url'])
        const t0 = performance.now()
        const r = await fn()
        const ms = Math.round(performance.now() - t0)
        const got = await label()
        const ok = r.code === 0 && (!want || got === want())
        steps.push({ name, ms, ok, label: got, laserBefore: laser, exit: r.code })
        say(`${ok ? 'ok  ' : 'FAIL'} ${String(ms).padStart(7)} ms  ${name.padEnd(28)} ${got}`)
        return ok
    }

    const baseVersion = packVersion(base)
    let n1 = null
    let n = null
    let manifest = null
    let patch = null
    const chain = [
        () => step('install base (N-1)', async () => {
            const there = path.join(home, 'scratch', path.basename(base))
            fs.copyFileSync(base, there)
            return runTarget(target, ['install', there, sha256File(there), baseVersion], { quiet: true })
        }, () => baseVersion),
        async () => { n1 = await label(); return true },
        () => step('hot swap overlay (N)', async () => {
            const b = buildBundle(overlay)
            patch = { id: `ui.${b.sha8}`, at: isoNow(), who: who(), pack: path.basename(overlay), packSha256: sha256File(overlay), commit: null, manifest: b.sha8, dirs: b.dirs, files: b.files, decision: 'drill', accept: 'rollback drill on a replica', live: false }
            const r = await runTarget(target, ['apply', stamp(), b64(patch)], { input: b.bundle, quiet: true })
            fs.rmSync(b.tmp, { recursive: true, force: true })
            return r
        }, () => `${n1}+${patch.id}`),
        async () => {
            n = await label()
            const m = await runTarget(target, ['manifest'], { quiet: true })
            manifest = JSON.parse(m.stdout)
            fs.writeFileSync(path.join(home, 'scratch', 'drill-manifest.json'), m.stdout)
            return m.code === 0
        },
        () => step('rollback N -> N-1', () => runTarget(target, ['undo', stamp()], { quiet: true }), () => n1),
        () => step('forward N-1 -> N', () => {
            const { bundle, bundleSha256, before, ...line } = manifest.overlays[0]
            return runTarget(target, ['apply', stamp(), b64(line), '--bundle', bundle], { quiet: true })
        }, () => n),
        () => step('restore from the manifest', async () => {
            const r = await restoreFromManifest(target, manifest, { quiet: true })
            return { code: r.code }
        }, () => n)
    ]
    say(`rollback drill on ${home}: base ${path.basename(base)}, overlay ${path.basename(overlay)}`)
    let ok = true
    for (const link of chain) { if (!(await link())) { ok = false; break } }
    const result = {
        at: isoNow(), who: who(), host: os.hostname(), replica: home, base: path.basename(base), overlay: path.basename(overlay),
        n1, n, ok, steps, totalMs: steps.reduce((s, x) => s + x.ms, 0),
        limits: 'replica: no npm ci, no smoke test, no service restart in these times; laser read only with --laser-url'
    }
    appendJsonl(path.join(dir, 'drills.log'), result)
    say(`${ok ? 'DRILL OK' : 'DRILL FAILED'}: ${steps.length} steps, ${result.totalMs} ms in all · ${path.join(dir, 'drills.log')}`)
    process.exitCode = ok ? EXIT.ok : 1
})
