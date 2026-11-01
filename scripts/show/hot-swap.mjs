#!/usr/bin/env node
// scripts/show/hot-swap.mjs — put the desk ui folders of a pack live WITHOUT restarting the server (the laser stays
// armed or disarmed as it is). From di-atlas ui-hot-swap.sh (2026-11-01), with the gate in front.
//
//   node scripts/show/hot-swap.mjs <pack.tar.gz> --production <name> (--host <user@host> | --home <DI home>)
//        [--record <file>] [--accept '<reason>'] [--when-up] [--checkpoint-cmd '<cmd>'] [--go-cmd '<cmd>']
//        [--server <url>] [--soak <seconds>] [--on-no-go undo|warn] [--no-reload] [--dry-run]
//   node scripts/show/hot-swap.mjs --undo --production <name> (--host … | --home …)
//
// A hot swap is a new release folder: target.py clones the live release, lays the ui bundle over the clone, checks
// every ui file against the manifest, appends one line to PATCHES (append-only) and exchanges the two folders' paths
// in one rename. The release before stays whole beside it; `di version` shows <version>+ui.<commit sha8> per overlay,
// or +uim.<manifest sha8> when no record names a commit (two kinds, two prefixes: audit S10 verify F3).
// The gate runs first and, with --when-up, AGAIN at the moment the target answers. While the show is live: green
// tests on the exact commit, a readable PASS review with no open must-fix, a checkpoint first and a GO soak after
// (default 60 s; S13 marks 60 s unvalidated). A NO-GO in the soak undoes the overlay at once (--on-no-go undo, the
// default) or keeps it and says so with exit 10 (--on-no-go warn, or DI_SHOW_ON_NO_GO=warn). Which one is the show's
// rule is the owner's decision; both modes exist so that either answer is a setting (audit S10 verify F7).
import fs from 'node:fs'
import path from 'node:path'
import {
    EXIT, UsageError, acceptOf, b64, buildBundle, evaluateGate, isoNow, logAction, main, packKind, packEntries, parseArgs,
    parseShalist, printGate, productionDir, readLive, runShell, runTarget, say, serverArgs, sha256File, sharedChanges,
    soak, stamp, targetFrom, UI_DIRS, waitUp, who
} from '../release/lib.mjs'

main(async () => {
    const { _, flags } = parseArgs(process.argv.slice(2), ['dry-run', 'undo', 'when-up', 'no-reload'])
    const production = flags.production || process.env.DI_SHOW_PRODUCTION
    productionDir(production)
    const target = targetFrom(flags)
    const reload = target.kind === 'ssh' && !flags['no-reload'] ? ['--reload'] : []
    const server = serverArgs(target, flags)
    const undoLine = `node scripts/show/hot-swap.mjs --undo --production ${production} ${target.flags.join(' ')}`

    if (flags.undo) {
        const r = await runTarget(target, ['undo', stamp(), ...reload, ...server])
        const label = (await runTarget(target, ['label'], { quiet: true })).stdout.trim()
        logAction(production, { action: 'undo', target: target.label, outcome: r.code === 0 ? 'undone' : 'failed', exit: r.code, label })
        process.exitCode = r.code === 0 ? EXIT.ok : EXIT.target
        return
    }

    if (!_[0]) throw new UsageError('hot-swap.mjs <pack.tar.gz> --production <name> (--host … | --home …) | --undo …')
    const pack = path.resolve(_[0])
    if (!fs.existsSync(pack)) throw new UsageError(`no pack at ${pack}`)
    const accept = acceptOf(flags)
    const goCmd = flags['go-cmd'] || process.env.DI_SHOW_GO_CMD || null
    const checkpoint = flags['checkpoint-cmd'] || process.env.DI_SHOW_CHECKPOINT_CMD || null
    const soakSeconds = flags.soak === undefined ? 60 : Number(flags.soak)
    if (!(soakSeconds >= 0)) throw new UsageError('--soak <seconds> must be a number >= 0')
    const onNoGo = flags['on-no-go'] || process.env.DI_SHOW_ON_NO_GO || 'undo'
    if (!['undo', 'warn'].includes(onNoGo)) throw new UsageError(`--on-no-go undo|warn: what a NO-GO in the soak does (got "${onNoGo}")`)

    const evaluate = async (phase) => {
        const live = readLive(production)
        const shared = await sharedChanges(pack, target)
        const g = evaluateGate({
            pack, recordFile: flags.record || null, action: 'hot-swap', live, accept, sharedChanged: shared,
            freeze: { checkpoint: Boolean(checkpoint), go: Boolean(goCmd) || server.length > 0 }
        })
        if (phase === 'fire') say('re-checked at the moment it fires:')
        printGate(g, { accept, live })
        if (shared === null) say('shared/  not checked: the target did not answer')
        return { g, live, shared }
    }
    const entry = (g, live, extra) => ({
        action: 'hot-swap', target: target.label, pack: path.basename(pack), sha256: g.digest, record: g.recordFile, accept,
        live: Boolean(live), decision: g.decision, reasons: [...g.hard, ...g.soft], ...extra
    })

    let { g, live, shared } = await evaluate('start')
    if (g.decision === 'refused') { logAction(production, entry(g, live, { phase: 'start', outcome: 'refused' })); process.exitCode = EXIT.refused; return }
    if (flags['when-up']) {
        logAction(production, entry(g, live, { phase: 'start', outcome: 'waiting for the target' }))
        say(`waiting for ${target.label} to answer (every ${process.env.DI_SHOW_UP_EVERY || 20} s, up to ${Math.round(Number(process.env.DI_SHOW_UP_FOR || 5400) / 60)} min); the gate runs again when it does`)
        if (!(await waitUp(target))) { logAction(production, entry(g, live, { phase: 'fire', outcome: 'target never answered' })); say('NO-GO: the target did not answer'); process.exitCode = EXIT.down; return }
        ;({ g, live, shared } = await evaluate('fire'))
        if (g.decision === 'refused') { logAction(production, entry(g, live, { phase: 'fire', outcome: 'refused' })); process.exitCode = EXIT.refused; return }
    }
    if (shared === null) { logAction(production, entry(g, live, { outcome: 'target did not answer' })); say('NO-GO: the target did not answer'); process.exitCode = EXIT.down; return }
    if (packKind(packEntries(pack)) === 'full') say('note: a full pack: only its ui folders go in now; any engine change in it waits for a full install')
    if (flags['dry-run']) { say('dry run: would clone the live release, lay the ui folders over the clone, append PATCHES and exchange the two paths. Nothing changed.'); return }

    if (checkpoint) {
        const code = await runShell(checkpoint, { env: { DI_SHOW_WHY: `hot swap ${path.basename(pack)}`, DI_SHOW_PRODUCTION: production } })
        if (code !== 0) { logAction(production, entry(g, live, { outcome: 'checkpoint-failed', exit: code })); say(`NO-GO: the checkpoint failed (exit ${code}); nothing changed`); process.exitCode = EXIT.checkpoint; return }
    } else {
        say('checkpoint: none given (--checkpoint-cmd or DI_SHOW_CHECKPOINT_CMD); the release before stays whole beside the new one')
    }

    const have = target.kind === 'ssh' ? parseShalist((await runTarget(target, ['shalist', ...UI_DIRS], { quiet: true })).stdout) : null
    const b = buildBundle(pack, { have })
    const commit = g.record?.predicate?.commit || null
    const id = commit ? `ui.${commit.slice(0, 8)}` : `uim.${b.sha8}`
    const patch = {
        id, at: isoNow(), who: who(), pack: path.basename(pack), packSha256: g.digest,
        recordSha256: g.recordFile && g.record ? sha256File(g.recordFile) : null, commit, manifest: b.sha8, dirs: b.dirs,
        files: b.files, decision: g.decision, accept: g.decision === 'accepted' ? accept : null, live: Boolean(live)
    }
    say(`bundle: ${b.sent} of ${b.files} ui files to send, manifest ${b.sha8}, overlay ${id}`)
    const r = await runTarget(target, ['apply', stamp(), b64(patch), ...reload, ...server], { input: b.bundle })
    fs.rmSync(b.tmp, { recursive: true, force: true })
    if (r.code !== 0) {
        logAction(production, entry(g, live, { outcome: 'apply-failed', id, exit: r.code }))
        say(r.code === 3 ? 'NO-GO: a file did not match the manifest; nothing changed' : `NO-GO: the apply failed (exit ${r.code}); see the lines above`)
        process.exitCode = r.code === 3 ? EXIT.sha : EXIT.target
        return
    }
    if (live) {
        const s = await soak(target, { seconds: soakSeconds, goCmd, server })
        if (!s.ok && onNoGo === 'warn') {
            const kept = (await runTarget(target, ['label'], { quiet: true })).stdout.trim()
            say(`NO-GO in the soak (check ${s.runs}): ${id} STAYS live (--on-no-go warn) · ${kept}`)
            say(`undo: ${undoLine}`)
            logAction(production, entry(g, live, { outcome: 'soak-failed-kept', id, label: kept, onNoGo }))
            process.exitCode = EXIT.soakKept
            return
        }
        if (!s.ok) {
            say(`NO-GO in the soak (check ${s.runs}): undoing ${id} now (--on-no-go undo)`)
            const u = await runTarget(target, ['undo', stamp(), ...reload, ...server])
            const back = (await runTarget(target, ['label'], { quiet: true })).stdout.trim()
            logAction(production, entry(g, live, { outcome: 'soak-failed-undone', id, undoExit: u.code, label: back, onNoGo }))
            process.exitCode = EXIT.soak
            return
        }
        say(`GO held for ${soakSeconds} s (${s.runs} check${s.runs === 1 ? '' : 's'})`)
    } else if (goCmd || server.length) {
        const ok = goCmd ? (await runShell(goCmd)) === 0 : (await runTarget(target, ['check', ...server])).code === 0
        say(ok ? 'check after: GO' : `check after: NO-GO (the overlay stays; undo: ${undoLine})`)
    }
    const label = (await runTarget(target, ['label'], { quiet: true })).stdout.trim()
    logAction(production, entry(g, live, { outcome: 'applied', id, label }))
    say(`live: ${label}`)
    say(`undo: ${undoLine}`)
})
