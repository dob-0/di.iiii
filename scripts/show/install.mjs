#!/usr/bin/env node
// scripts/show/install.mjs — install a di runtime pack on a show machine through the release gate.
// From di-atlas install-look.sh (2026-10-31), now with the record and the gate in front.
//
//   node scripts/show/install.mjs <di-runtime-…tar.gz> --production <name> (--host <user@host> | --home <DI home>)
//        [--record <file>] [--accept '<reason>'] [--checkpoint-cmd '<cmd>'] [--server <url>] [--dry-run]
//
// 1. The record's three lines first (release, tests, review), then the gate: a BLOCKed, untested or not-on-a-remote
//    build is refused unless --accept '<reason>'; while the show is live (scripts/release/show-live.mjs) a full
//    install is refused, --accept or not. Every attempt is logged to <DI_SHOW_DIR>/<production>/installs.log.
// 2. The checkpoint command, when given (S13's `di show checkpoint` once it exists; owner's rule 10-17: a checkpoint
//    before every show change).
// 3. The pack goes to the target's scratch/, target.py checks its sha256 THERE, keeps it in packs/ (the restore
//    manifest names it) and runs `di update --from` it (DI_SHOW_UPDATE_CMD replaces that on a replica).
// Undo: scripts/release/restore.mjs with the manifest of the checkpoint taken before (or `di rollback` on the target).
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import {
    EXIT, SSH_OPTS, UsageError, acceptOf, evaluateGate, logAction, main, packVersion, parseArgs, printGate,
    productionDir, readLive, runShell, runTarget, say, serverArgs, targetFrom
} from '../release/lib.mjs'

main(async () => {
    const { _, flags } = parseArgs(process.argv.slice(2), ['dry-run'])
    if (!_[0]) throw new UsageError('install.mjs <di-runtime-…tar.gz> --production <name> (--host <user@host> | --home <dir>)')
    const pack = path.resolve(_[0])
    if (!fs.existsSync(pack) || !packVersion(pack)) throw new UsageError(`not a di runtime pack: ${pack}`)
    const production = flags.production || process.env.DI_SHOW_PRODUCTION
    productionDir(production)
    const target = targetFrom(flags)
    const accept = acceptOf(flags)
    const live = readLive(production)
    const g = evaluateGate({ pack, recordFile: flags.record || null, action: 'install', live, accept })
    printGate(g, { accept, live })
    const base = { action: 'install', target: target.label, pack: path.basename(pack), sha256: g.digest, record: g.recordFile, accept, live: Boolean(live), decision: g.decision, reasons: [...g.hard, ...g.soft] }
    if (g.decision === 'refused') { logAction(production, { ...base, outcome: 'refused' }); process.exitCode = EXIT.refused; return }
    const checkpoint = flags['checkpoint-cmd'] || process.env.DI_SHOW_CHECKPOINT_CMD || null
    if (flags['dry-run']) {
        say(`dry run: would ${checkpoint ? `run the checkpoint (${checkpoint}), ` : ''}copy the pack to ${target.label}/scratch, check its sha256 there and install it. Nothing changed.`)
        return
    }
    if (checkpoint) {
        const code = await runShell(checkpoint, { env: { DI_SHOW_WHY: `install ${path.basename(pack)}`, DI_SHOW_PRODUCTION: production } })
        if (code !== 0) { logAction(production, { ...base, outcome: 'checkpoint-failed', exit: code }); say(`NO-GO: the checkpoint failed (exit ${code}); nothing changed`); process.exitCode = EXIT.checkpoint; return }
    } else {
        say('checkpoint: none given (--checkpoint-cmd or DI_SHOW_CHECKPOINT_CMD); the owner\'s rule asks for one before every show change')
    }
    let there
    if (target.kind === 'local') {
        const scratch = path.join(target.home, 'scratch')
        fs.mkdirSync(scratch, { recursive: true })
        there = path.join(scratch, path.basename(pack))
        fs.copyFileSync(pack, there)
    } else {
        const dest = `${target.home.replace(/^~\//, '')}/scratch/`
        const copy = spawnSync('rsync', ['-t', '--partial', '-e', `ssh ${SSH_OPTS.join(' ')}`, pack, `${target.host}:${dest}`], { stdio: 'inherit' })
        if (copy.status !== 0) { logAction(production, { ...base, outcome: 'copy-failed', exit: copy.status }); process.exitCode = EXIT.down; return }
        there = `${target.home}/scratch/${path.basename(pack)}`
    }
    const r = await runTarget(target, ['install', there, g.digest, packVersion(pack), ...serverArgs(target, flags)])
    const label = r.code === 0 ? (await runTarget(target, ['label'], { quiet: true })).stdout.trim() : null
    logAction(production, { ...base, outcome: r.code === 0 ? 'installed' : 'failed', exit: r.code, label })
    if (r.code !== 0) { process.exitCode = r.code === 3 ? EXIT.sha : EXIT.target; return }
    say(`installed: ${label}`)
})
