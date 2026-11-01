#!/usr/bin/env node
// scripts/release/record.mjs — the release record of a di runtime pack. Method and schema: scripts/release/README.md.
//
//   node scripts/release/record.mjs tests [--repo <dir>] -- <test command…>
//       runs the command in the repo at HEAD and keeps "Tests N passed", the command, the commit and whether the
//       tree was clean, in <DI_RELEASE_DIR>/tests/<commit>.jsonl (default ~/di-health/release). Exit = the command's.
//   node scripts/release/record.mjs pack <pack.tar.gz> [--repo <dir>] [--commit <sha>] [--review <file>]
//       [--tests <run.json>] [--remote origin] [--no-fetch] [--out <file>]
//       writes <pack>.release.json (an in-toto Statement, self-attested) and a copy under records/<sha256>.json.
//       The commit comes from the pack's own release.json; a ui-only pack has none, so --commit names it.
//   node scripts/release/record.mjs show <pack.tar.gz> [--record <file>]
//       prints the record's three lines and what the gate would say (nothing is installed).
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
    EXIT, REPO_ROOT, UsageError, appendJsonl, evaluateGate, isoNow, main, makeRecord, parseArgs, parseTestSummary,
    printGate, releaseDir, resolveCommit, say, stamp, testRunsFile, treeClean, writeRecord
} from './lib.mjs'

const runTests = ({ repo, command }) => new Promise((resolve) => {
    const logDir = path.join(releaseDir(), 'tests')
    fs.mkdirSync(logDir, { recursive: true })
    const commit = resolveCommit(repo, 'HEAD')
    if (!commit) throw new UsageError(`${repo} is not a git checkout`)
    const clean = treeClean(repo)
    const log = path.join(logDir, `${commit}-${stamp()}.log`)
    const out = fs.createWriteStream(log)
    const ranAt = isoNow()
    let text = ''
    const child = spawn(command[0], command.slice(1), { cwd: repo, stdio: ['ignore', 'pipe', 'pipe'] })
    const take = (d, sink) => { text += d; out.write(d); sink.write(d) }
    child.stdout.on('data', (d) => take(d, process.stdout))
    child.stderr.on('data', (d) => take(d, process.stderr))
    child.on('error', (error) => { text += error.message; resolve({ code: 127, text, commit, clean, log, ranAt }) })
    child.on('close', (code) => { out.end(); resolve({ code: code ?? 1, text, commit, clean, log, ranAt }) })
})

main(async () => {
    const [sub, ...argv] = process.argv.slice(2)
    if (sub === 'tests') {
        const { flags, rest } = parseArgs(argv)
        if (!rest?.length) throw new UsageError('record.mjs tests [--repo <dir>] -- <test command…>')
        const repo = path.resolve(flags.repo || REPO_ROOT)
        const r = await runTests({ repo, command: rest })
        const summary = parseTestSummary(r.text)
        const run = {
            commit: r.commit, clean: r.clean, command: rest.join(' '), cwd: repo, exitCode: r.code, summary,
            ranAt: r.ranAt, finishedAt: isoNow(), host: os.hostname(), log: r.log
        }
        appendJsonl(testRunsFile(r.commit), run)
        say(`test run kept: ${summary ? summary.line : 'NO "Tests N passed" line'} · exit ${r.code} · ${r.commit.slice(0, 8)}${r.clean ? '' : ' (DIRTY tree: this run does not count for the gate)'}`)
        say(`  ${testRunsFile(r.commit)}`)
        process.exitCode = r.code
        return
    }
    if (sub === 'pack') {
        const { _, flags } = parseArgs(argv, ['no-fetch'])
        if (!_[0]) throw new UsageError('record.mjs pack <pack.tar.gz> [--commit <sha>] [--review <file>] …')
        const pack = path.resolve(_[0])
        const testsRun = flags.tests ? JSON.parse(fs.readFileSync(flags.tests, 'utf8')) : undefined
        const record = makeRecord({
            pack, repo: path.resolve(flags.repo || REPO_ROOT), commit: flags.commit || null, testsRun,
            reviewFile: flags.review || null, remote: flags.remote || 'origin', fetch: !flags['no-fetch']
        })
        const { beside, stored } = writeRecord(record, pack, flags.out)
        const g = evaluateGate({ pack, recordFile: beside, action: 'install' })
        printGate(g)
        say(`record: ${beside}`)
        say(`  copy: ${stored}`)
        return
    }
    if (sub === 'show') {
        const { _, flags } = parseArgs(argv)
        if (!_[0]) throw new UsageError('record.mjs show <pack.tar.gz> [--record <file>]')
        const g = evaluateGate({ pack: path.resolve(_[0]), recordFile: flags.record || null, action: 'install' })
        printGate(g)
        process.exitCode = g.decision === 'pass' ? EXIT.ok : EXIT.refused
        return
    }
    throw new UsageError('record.mjs tests|pack|show … (see the header of scripts/release/record.mjs)')
})
