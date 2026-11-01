#!/usr/bin/env node
// scripts/release/restore.mjs — one command puts a release back as a manifest says: the base pack, then every
// overlay in order, then the label is compared.
//
//   node scripts/release/restore.mjs --manifest <release-manifest.json> --production <name> (--host … | --home …)
//
// The manifest is <DI home>/release-manifest.json, rewritten by target.py after every install, hot swap and undo;
// a checkpoint keeps a copy of it (S13's `di show checkpoint`). Every file it names (packs/<pack>, overlays/<id>.
// <sha8>.tar.gz) stays on the target, so a restore needs no link to the builder. All files are checked against
// their sha256 BEFORE anything is touched. A restore re-installs the engine, so it is refused while the show is
// live: turn the flag off first (scripts/release/show-live.mjs off --why …); that turn is logged too.
import fs from 'node:fs'
import { EXIT, UsageError, logAction, main, parseArgs, productionDir, readLive, restoreFromManifest, say, targetFrom } from './lib.mjs'

main(async () => {
    const { flags } = parseArgs(process.argv.slice(2))
    const production = flags.production || process.env.DI_SHOW_PRODUCTION
    productionDir(production)
    const target = targetFrom(flags)
    if (!flags.manifest) throw new UsageError('restore.mjs --manifest <release-manifest.json> --production <name> (--host … | --home …)')
    const manifest = JSON.parse(fs.readFileSync(flags.manifest, 'utf8'))
    if (manifest.kind !== 'di release manifest v1' || !manifest.label || !manifest.base) throw new UsageError(`${flags.manifest} is not a di release manifest`)
    say(`restore ${manifest.label}: base ${manifest.base.pack} + ${manifest.overlays?.length || 0} overlay(s) on ${target.label}`)
    if (readLive(production)) {
        logAction(production, { action: 'restore', target: target.label, label: manifest.label, outcome: 'refused', reasons: ['the show is live'] })
        say('REFUSED: the show is live; a restore re-installs the engine. Turn the flag off first (show-live.mjs off --why …).')
        process.exitCode = EXIT.refused
        return
    }
    const r = await restoreFromManifest(target, manifest)
    logAction(production, { action: 'restore', target: target.label, label: manifest.label, outcome: r.ok ? 'restored' : 'failed', exit: r.code, why: r.why || null })
    say(r.ok ? `restored: ${r.label}` : `NOT restored: ${r.why}`)
    process.exitCode = r.code
})
