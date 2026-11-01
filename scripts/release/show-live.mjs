#!/usr/bin/env node
// scripts/release/show-live.mjs — the show-live flag that turns on the freeze of scripts/show/{install,hot-swap}.mjs.
//
//   node scripts/release/show-live.mjs on  --production <name> --why '<doors open, …>'
//   node scripts/release/show-live.mjs off --production <name> --why '<get-out, …>'
//   node scripts/release/show-live.mjs status --production <name>
//
// While the flag is on: no full install (engine and config wait for the end of the show); an overlay of the ui
// folders goes in only with a matching record, green tests on the exact commit, no BLOCK, a checkpoint first and a
// GO soak after. ITIL 4's emergency-change minimum (same testing, assessment, authorization; documentation may
// follow), as quoted in audit RESEARCH-show-safety §7; the "ui-only overlay" class itself has no source: unvalidated.
// The flag is <DI_SHOW_DIR>/<production>/LIVE (default ~/di-health/show); every on/off is kept in freeze.log there.
import fs from 'node:fs'
import path from 'node:path'
import { UsageError, appendJsonl, isoNow, liveFile, main, parseArgs, productionDir, readLive, say, who } from './lib.mjs'

main(async () => {
    const { _, flags } = parseArgs(process.argv.slice(2))
    const production = flags.production || process.env.DI_SHOW_PRODUCTION
    const dir = productionDir(production)
    const log = path.join(dir, 'freeze.log')
    const sub = _[0]
    if (sub === 'status') {
        const live = readLive(production)
        say(live ? `LIVE since ${live.since} (${live.who}): ${live.why}` : `not live: ${production} has no show running`)
        return
    }
    if (sub !== 'on' && sub !== 'off') throw new UsageError('show-live.mjs on|off|status --production <name> [--why <text>]')
    const why = String(flags.why || '').trim()
    if (why.length < 3) throw new UsageError('--why <text> is required: the flag says who turned it and why')
    fs.mkdirSync(dir, { recursive: true })
    const entry = { at: isoNow(), who: who(), turn: sub, why }
    if (sub === 'on') {
        const tmp = `${liveFile(production)}.partial`
        fs.writeFileSync(tmp, `${JSON.stringify({ since: entry.at, who: entry.who, why }, null, 2)}\n`)
        fs.renameSync(tmp, liveFile(production))
    } else {
        fs.rmSync(liveFile(production), { force: true })
    }
    appendJsonl(log, entry)
    say(sub === 'on' ? `LIVE: the freeze is on for ${production}` : `not live: the freeze is off for ${production}`)
})
