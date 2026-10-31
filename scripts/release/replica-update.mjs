#!/usr/bin/env node
// scripts/release/replica-update.mjs --home <replica DI home> --from <di-runtime-…tar.gz>
//
// A replica's stand-in for `di update --from`: the same unpack (strip the top folder into versions/<v>.partial) and
// the same activate() and pruneVersions() as the di CLI (scripts/di/install.mjs), WITHOUT `npm ci`, the smoke test
// on a test port or the service. For a replica DI home (the tests, the rollback drill on this machine), never for an
// install: a real install is `di update --from`, which scripts/release/target.py runs when DI_SHOW_UPDATE_CMD is unset.
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { activate, pruneVersions, releaseFromFile } from '../di/install.mjs'
import { paths } from '../di/paths.mjs'
import { installedVersion, readState } from '../di/state.mjs'
import { UsageError, main, parseArgs, say } from './lib.mjs'

main(async () => {
    const { flags } = parseArgs(process.argv.slice(2))
    if (!flags.home || !flags.from) throw new UsageError('replica-update.mjs --home <replica DI home> --from <pack>')
    const home = path.resolve(flags.home)
    if (home === path.join(os.homedir(), '.di')) throw new UsageError('this is the installed di, not a replica: use `di update --from`')
    const release = await releaseFromFile(flags.from)
    const p = paths(home)
    const finalDir = p.versionDir(release.version)
    const partialDir = `${finalDir}.partial`
    fs.rmSync(partialDir, { recursive: true, force: true })
    fs.mkdirSync(partialDir, { recursive: true })
    const x = spawnSync('tar', ['-xzf', path.resolve(flags.from), '-C', partialDir, '--strip-components', '1'], { encoding: 'utf8' })
    if (x.status !== 0) throw new Error(`cannot unpack: ${x.stderr.trim()}`)
    const from = installedVersion(home)
    await activate({ home, partialDir, finalDir, version: release.version, mode: readState(home).mode })
    await pruneVersions({ home, keep: [release.version, from].filter(Boolean) })
    say(`replica: ${from || 'nothing'} -> ${release.version} (no npm ci, no smoke test, no service: a replica, not an install)`)
})
