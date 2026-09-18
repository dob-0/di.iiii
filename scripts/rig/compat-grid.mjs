#!/usr/bin/env node
/**
 * scripts/rig/compat-grid.mjs — usage:
 *
 *   node scripts/rig/compat-grid.mjs --a <dirA> --b <dirB> [--key K]
 *   node scripts/rig/compat-grid.mjs --refs HEAD,v0.5.0,v0.4.9 [--key K]
 *   node scripts/rig/compat-grid.mjs --mock [--key K]
 *
 * The compatibility grid from docs/architecture/RIG.md §3 rule 6 and
 * docs/architecture/rig/PROTOCOL-1.md §7: every member plays against every
 * other member — hello, agreed = min-rule on both sides, a cue, a blackout,
 * and mutual membership — and CI's job is a red square blocking the release.
 *
 * `--a/--b` starts two members from two checkout dirs (each `<dir>/serverXR/
 * src/index.js` — a git checkout, a worktree, or an unpacked `npm run
 * di:pack` tarball's stage dir all qualify, see start-member.mjs).
 *
 * `--refs a,b,c` creates a temp `git worktree add --detach` per ref off THIS
 * checkout, symlinks `node_modules` and `serverXR/node_modules` from this
 * checkout into each (never `npm install` — see AGENTS.md / RIG.md "Rules
 * for every lane"), then runs every pair. A ref whose server answers
 * `/api/health` but 404s on `/api/rig/hello` predates protocol 1 — it is
 * reported "pre-protocol" and skipped, not failed.
 *
 * `--mock` starts two scripts/rig/mock-member.mjs instances instead of real
 * servers — this lane's own self-test, since serverXR/src/rig/* is lane A's
 * work and isn't on this branch yet.
 *
 * Runs scripts/rig/conformance.mjs (via `--json`) on every live member, then
 * cross-checks every pair, then prints an NxN ✓/✗ grid. Exits 1 if any cell
 * is ✗ (a pre-protocol cell is neither ✓ nor ✗ and does not fail the run).
 */

import { randomUUID } from 'node:crypto'
import { spawn, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import readline from 'node:readline'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'

import { agree, request, signedHeaders } from './lib.mjs'
import { startMember } from './start-member.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(__dirname, '..', '..')
const CONFORMANCE = path.join(__dirname, 'conformance.mjs')
const MOCK_MEMBER = path.join(__dirname, 'mock-member.mjs')

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const { values: args } = parseArgs({
    options: {
        a: { type: 'string' },
        b: { type: 'string' },
        refs: { type: 'string' },
        mock: { type: 'boolean', default: false },
        key: { type: 'string' },
        room: { type: 'string' }
    }
})

const KEY = args.key || null

// ── starting members ──────────────────────────────────────────────────────

/** Spawns a mock-member.mjs and waits for its readiness line. */
const startMockMember = (label, opts = {}) => new Promise((resolve, reject) => {
    const cliArgs = [MOCK_MEMBER, '--port', '0', '--host', '127.0.0.1', '--name', label]
    if (opts.key) cliArgs.push('--key', opts.key)
    if (opts.room !== undefined) cliArgs.push('--room', String(opts.room))
    const child = spawn(process.execPath, cliArgs, { stdio: ['ignore', 'pipe', 'pipe'] })
    const rl = readline.createInterface({ input: child.stdout })
    let settled = false
    let stderrTail = ''
    child.stderr.on('data', (chunk) => { stderrTail += chunk.toString() })
    rl.once('line', (line) => {
        settled = true
        rl.close()
        try {
            const info = JSON.parse(line)
            resolve({
                label,
                base: info.base,
                pid: info.pid,
                stop: async () => {
                    try { child.kill('SIGTERM') } catch { /* already gone */ }
                    await wait(200)
                    try { child.kill('SIGKILL') } catch { /* already gone */ }
                }
            })
        } catch (err) {
            reject(new Error(`mock-member printed non-JSON readiness line: ${line} (${err.message})`))
        }
    })
    child.once('error', reject)
    child.once('exit', (code) => {
        if (!settled) reject(new Error(`mock-member exited before it was ready (code ${code}): ${stderrTail}`))
    })
})

const sanitizeRefName = (ref) => ref.replace(/[^a-zA-Z0-9._-]/g, '_')

/**
 * `git worktree add --detach <tmp>/<dirName>` off THIS checkout, node_modules
 * symlinked in. `dirName` is caller-supplied (not derived from `ref` here) so
 * the same ref can be used twice — CI's "no qualifying tag yet" fallback is
 * `--refs HEAD,HEAD`, which needs two distinct worktrees of the same ref.
 */
const createRefWorktree = async (ref, worktreeParent, dirName) => {
    const dir = path.join(worktreeParent, dirName)
    const add = spawnSync('git', ['worktree', 'add', '--detach', dir, ref], { cwd: REPO_ROOT, encoding: 'utf8' })
    if (add.status !== 0) {
        throw new Error(`git worktree add failed for ref "${ref}": ${add.stderr || add.stdout}`)
    }
    // Never `npm install` in a lane worktree — symlink the same node_modules
    // this checkout already uses (itself a symlink per RIG.md "Rules for
    // every lane"; Node follows the chain fine).
    const links = [
        [path.join(REPO_ROOT, 'node_modules'), path.join(dir, 'node_modules')],
        [path.join(REPO_ROOT, 'serverXR', 'node_modules'), path.join(dir, 'serverXR', 'node_modules')]
    ]
    for (const [target, linkPath] of links) {
        if (fs.existsSync(target) && !fs.existsSync(linkPath)) {
            await fsp.symlink(target, linkPath, 'dir')
        }
    }
    return dir
}

const removeRefWorktree = async (dir) => {
    spawnSync('git', ['worktree', 'remove', '--force', dir], { cwd: REPO_ROOT, encoding: 'utf8' })
}

// ── protocol-level probes ────────────────────────────────────────────────

/** 404 on /api/rig/hello (with a healthy /api/health) = pre-protocol-1 release. */
const probePreProtocol = async (base) => {
    const bodyObj = { rig: 1, kind: 'hello', machine: { id: `compat-grid-probe-${randomUUID().slice(0, 8)}` } }
    const raw = JSON.stringify(bodyObj)
    const res = await request(`${base}/api/rig/hello`, { method: 'POST', body: raw, headers: signedHeaders(KEY, raw) })
    return res.status === 404
}

const getCard = async (base) => {
    const res = await request(`${base}/api/rig/card`)
    if (res.status !== 200 || !res.json) throw new Error(`GET /api/rig/card failed: ${res.status}`)
    return res.json
}

const postSigned = (base, routePath, bodyObj) => {
    const raw = JSON.stringify(bodyObj)
    return request(`${base}${routePath}`, { method: 'POST', body: raw, headers: signedHeaders(KEY, raw) })
}

/** A hellos B, checking response shape + the agree() min-rule against both sides' own features. */
const crossHello = async (fromCard, toBase) => {
    const res = await postSigned(toBase, '/api/rig/hello', {
        rig: 1,
        kind: 'hello',
        release: fromCard.release,
        machine: fromCard.machine,
        part: fromCard.part,
        room: null,
        http: { port: 0, base: '/serverXR' },
        features: fromCard.features,
        sentAt: Date.now()
    })
    return res
}

/** Full A↔B cross-check from PROTOCOL-1.md §2.1–§2.6, both directions. */
const crossCheckPair = async (memberA, memberB) => {
    const problems = []
    let aCard
    let bCard
    try {
        aCard = await getCard(memberA.base)
        bCard = await getCard(memberB.base)
    } catch (err) {
        return { ok: false, detail: `card fetch failed: ${err.message}` }
    }

    const expectedAgreed = agree(aCard.features, bCard.features)

    const aToB = await crossHello(aCard, memberB.base)
    if (aToB.status !== 200) problems.push(`A→B hello: status ${aToB.status}`)
    else if (JSON.stringify(aToB.json?.agreed) !== JSON.stringify(expectedAgreed)) {
        problems.push(`A→B agreed mismatch: got ${JSON.stringify(aToB.json?.agreed)}, expected ${JSON.stringify(expectedAgreed)}`)
    }

    const bToA = await crossHello(bCard, memberA.base)
    if (bToA.status !== 200) problems.push(`B→A hello: status ${bToA.status}`)
    else if (JSON.stringify(bToA.json?.agreed) !== JSON.stringify(expectedAgreed)) {
        problems.push(`B→A agreed mismatch: got ${JSON.stringify(bToA.json?.agreed)}, expected ${JSON.stringify(expectedAgreed)}`)
    }

    const cue = await postSigned(memberB.base, '/api/rig/cue', {
        rig: 1, kind: 'cue', id: `compat-grid-${randomUUID()}`, name: 'ping', args: {},
        from: { id: aCard.machine.id, name: aCard.machine.name }, sentAt: Date.now()
    })
    if (cue.status !== 200 || cue.json?.accepted !== true) {
        problems.push(`A cues B ping: ${cue.status} ${JSON.stringify(cue.json)}`)
    }

    const blackoutOn = await postSigned(memberA.base, '/api/rig/blackout', {
        rig: 1, kind: 'blackout', on: true, from: { id: bCard.machine.id, name: bCard.machine.name }, sentAt: Date.now()
    })
    const cardAfter = await getCard(memberA.base).catch(() => null)
    if (blackoutOn.status !== 200 || blackoutOn.json?.blackout !== true || cardAfter?.blackout !== true) {
        problems.push(`B blackouts A: response=${JSON.stringify(blackoutOn.json)} card.blackout=${cardAfter?.blackout}`)
    }
    // Reset so this pair's state doesn't bleed into other checks.
    await postSigned(memberA.base, '/api/rig/blackout', {
        rig: 1, kind: 'blackout', on: false, from: { id: bCard.machine.id, name: bCard.machine.name }, sentAt: Date.now()
    })

    const membersOnA = await request(`${memberA.base}/api/rig/members`)
    const membersOnB = await request(`${memberB.base}/api/rig/members`)
    const aKnowsB = (membersOnA.json?.members || []).some(m => m.machine?.id === bCard.machine.id)
    const bKnowsA = (membersOnB.json?.members || []).some(m => m.machine?.id === aCard.machine.id)
    if (!aKnowsB) problems.push('A/members does not list B')
    if (!bKnowsA) problems.push('B/members does not list A')

    return problems.length === 0 ? { ok: true } : { ok: false, detail: problems.join('; ') }
}

// ── conformance per member ───────────────────────────────────────────────

const runConformance = (base) => new Promise((resolve) => {
    const cliArgs = [CONFORMANCE, '--base', base, '--json']
    if (KEY) cliArgs.push('--key', KEY)
    const child = spawnSync(process.execPath, cliArgs, { encoding: 'utf8' })
    let parsed = null
    try {
        parsed = JSON.parse((child.stdout || '').trim().split('\n').pop())
    } catch {
        parsed = null
    }
    resolve({
        ok: child.status === 0 && parsed && parsed.fail === 0,
        summary: parsed,
        raw: child.stdout,
        stderr: child.stderr
    })
})

// ── grid printing ────────────────────────────────────────────────────────

const printGrid = (members, cells) => {
    const labels = members.map(m => m.label)
    const colWidth = Math.max(3, ...labels.map(l => l.length))
    const rowLabelWidth = Math.max(3, ...labels.map(l => l.length))
    const header = `${' '.repeat(rowLabelWidth)}  ${labels.map(l => l.padEnd(colWidth)).join(' ')}`
    const lines = [header]
    for (let i = 0; i < members.length; i++) {
        const row = [labels[i].padEnd(rowLabelWidth)]
        for (let j = 0; j < members.length; j++) {
            row.push((cells[i][j] || '?').padEnd(colWidth))
        }
        lines.push(row.join(' '))
    }
    process.stdout.write(`${lines.join('\n')}\n`)
}

// ── main ─────────────────────────────────────────────────────────────────

const main = async () => {
    const cleanups = []
    /** @type {{label:string, base:string, stop:()=>Promise<void>, preProtocol?:boolean}[]} */
    let members = []

    try {
        if (args.mock) {
            const a = await startMockMember('mock-A', { key: KEY, room: args.room })
            const b = await startMockMember('mock-B', { key: KEY, room: args.room })
            members = [a, b]
            cleanups.push(a.stop, b.stop)
        } else if (args.refs) {
            const refs = args.refs.split(',').map(r => r.trim()).filter(Boolean)
            if (refs.length === 0) throw new Error('--refs given but empty')
            const worktreeParent = await fsp.mkdtemp(path.join(os.tmpdir(), 'di-rig-worktrees-'))
            cleanups.push(() => fsp.rm(worktreeParent, { recursive: true, force: true }))
            // The same ref can appear twice on purpose (CI's "no qualifying
            // tag yet" fallback runs `--refs HEAD,HEAD`) — give repeats their
            // own worktree dir and grid label instead of colliding.
            const refCounts = {}
            for (const ref of refs) refCounts[ref] = (refCounts[ref] || 0) + 1
            const seenSoFar = {}
            for (const ref of refs) {
                seenSoFar[ref] = (seenSoFar[ref] || 0) + 1
                const duplicated = refCounts[ref] > 1
                const dirName = duplicated ? `${sanitizeRefName(ref)}-${seenSoFar[ref]}` : sanitizeRefName(ref)
                const label = duplicated ? `${ref}#${seenSoFar[ref]}` : ref
                // HEAD could be run directly from this checkout, but a
                // worktree keeps every ref's process, port and DATA_ROOT
                // equally isolated, so every ref (HEAD included) gets one.
                const dir = await createRefWorktree(ref, worktreeParent, dirName)
                cleanups.push(() => removeRefWorktree(dir))
                const handle = await startMember({ dir, room: args.room, key: KEY, name: `rig-grid-${dirName}` })
                cleanups.push(handle.stop)
                members.push({ label, base: handle.base, stop: handle.stop })
            }
        } else if (args.a && args.b) {
            const a = await startMember({ dir: args.a, room: args.room, key: KEY, name: 'member-a' })
            const b = await startMember({ dir: args.b, room: args.room, key: KEY, name: 'member-b' })
            cleanups.push(a.stop, b.stop)
            members = [
                { label: path.basename(path.resolve(args.a)), base: a.base, stop: a.stop },
                { label: path.basename(path.resolve(args.b)), base: b.base, stop: b.stop }
            ]
        } else {
            process.stderr.write('usage:\n'
                + '  node scripts/rig/compat-grid.mjs --a <dirA> --b <dirB> [--key K]\n'
                + '  node scripts/rig/compat-grid.mjs --refs HEAD,v0.5.0,... [--key K]\n'
                + '  node scripts/rig/compat-grid.mjs --mock [--key K]\n')
            process.exit(2)
        }

        // Pre-protocol probe.
        for (const m of members) {
            m.preProtocol = await probePreProtocol(m.base)
        }

        // Conformance per member.
        for (const m of members) {
            if (m.preProtocol) {
                process.stdout.write(`[compat-grid] ${m.label}: pre-protocol (no /api/rig/hello) — skipped\n`)
                continue
            }
            const result = await runConformance(m.base)
            m.conformanceOk = result.ok
            process.stdout.write(`[compat-grid] ${m.label} conformance: ${result.ok ? 'PASS' : 'FAIL'}`
                + (result.summary ? ` (${result.summary.pass} pass, ${result.summary.fail} fail, ${result.summary.skip} skip)\n` : '\n'))
            if (!result.ok && result.raw) process.stdout.write(`${result.raw}\n`)
        }

        // Cross-check every pair.
        const n = members.length
        const cells = Array.from({ length: n }, () => Array(n).fill(''))
        let anyFail = false
        for (let i = 0; i < n; i++) {
            for (let j = 0; j < n; j++) {
                if (i === j) {
                    if (members[i].preProtocol) { cells[i][j] = '·'; continue }
                    cells[i][j] = members[i].conformanceOk ? '✓' : '✗'
                    if (!members[i].conformanceOk) anyFail = true
                    continue
                }
                if (j < i) { cells[i][j] = cells[j][i]; continue } // symmetric, fill once
                if (members[i].preProtocol || members[j].preProtocol) {
                    cells[i][j] = '·'
                    continue
                }
                const result = await crossCheckPair(members[i], members[j])
                cells[i][j] = result.ok ? '✓' : '✗'
                if (!result.ok) {
                    anyFail = true
                    process.stdout.write(`[compat-grid] ${members[i].label} × ${members[j].label}: FAIL — ${result.detail}\n`)
                } else {
                    process.stdout.write(`[compat-grid] ${members[i].label} × ${members[j].label}: PASS\n`)
                }
            }
        }

        process.stdout.write('\n')
        printGrid(members, cells)
        process.stdout.write('\n(✓ pass · ✗ fail · · pre-protocol, skipped)\n')

        process.exitCode = anyFail ? 1 : 0
    } finally {
        for (const cleanup of cleanups.reverse()) {
            try { await cleanup() } catch { /* best-effort teardown */ }
        }
    }
}

main().catch((err) => {
    process.stderr.write(`[compat-grid] fatal: ${String(err && err.stack || err)}\n`)
    process.exit(1)
})
