#!/usr/bin/env node
/**
 * run.mjs — the movement rig: walk di.iiii's first-person walker in a real,
 * headed Chromium on the real GPU and write down what it does in numbers.
 *
 *   node scripts/movement-rig/run.mjs --worktree ~/work/di.iiii-movefeel --label after-move
 *
 * One command: it builds its own isolated display, its own throwaway stack
 * from the TARGET worktree's code, its own rooms, runs every trial, and writes
 * results.json + report.md + evidence frames under --out. Nothing it starts
 * outlives it. See README.md for what each number means and its limits.
 *
 * Options
 *   --worktree <dir>      the di.iiii checkout to measure (default: this repo)
 *   --out <dir>           results folder (default: <this repo>/.movement-rig/<date>-<branch>)
 *   --label <text>        a name for this run in the report (default: the branch)
 *   --rooms a,b           synthetic,moxir (default both)
 *   --moxir-bundle <f>    walk this exact MOXIR bundle (pin it for before/after)
 *   --moxir-from <dir>    export MOXIR from this data root (default ~/.local/share/di.iiii/data)
 *   --only a,b            suites: move,look,fly,pacing,phone,eye (default all)
 *   --display host        run on the current $DISPLAY instead of a private
 *                         nested KWin (pointer lock will NOT be granted to a
 *                         window on a hidden virtual desktop — see README)
 *   --size WxH            the private display in device pixels (default 2560x1440,
 *                         the owner's panel) — the browser runs at DPR 1.5 on it
 */
import { spawnSync, execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const RIG_REPO = path.resolve(HERE, '..', '..')

const argv = process.argv.slice(2)
const arg = (name, fallback = null) => {
    const i = argv.indexOf(`--${name}`)
    if (i === -1) return fallback
    const v = argv[i + 1]
    return v && !v.startsWith('--') ? v : true
}
const expand = (p) => (p && p.startsWith('~') ? path.join(os.homedir(), p.slice(1)) : p)

const worktree = path.resolve(expand(arg('worktree', RIG_REPO)))
const branch = (() => { try { return execFileSync('git', ['-C', worktree, 'rev-parse', '--abbrev-ref', 'HEAD'], { encoding: 'utf8' }).trim() } catch { return 'unknown' } })()
const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')
const outDir = path.resolve(expand(arg('out', path.join(RIG_REPO, '.movement-rig', `${stamp}-${branch.replace(/[^\w.-]+/g, '_')}`))))
const size = String(arg('size', '2560x1440'))
const [W, H] = size.split('x').map(Number)

// ── step 0: our own display ─────────────────────────────────────────────────
// A window on the owner's hidden "agents" desktop cannot hold pointer lock (X
// refuses a grab on an unmapped window) and xdotool there would move HIS
// pointer. So the rig brings up a private nested KWin (virtual output, its own
// Xwayland) and runs itself inside it: real Chromium, real GPU, pointer lock
// granted, and nothing reaches the owner's screen, pointer or keyboard.
if (!process.env.DI_MOVRIG_INNER && arg('display') !== 'host') {
    fs.mkdirSync(outDir, { recursive: true })
    const script = path.join(outDir, 'inner.sh')
    const exitFile = path.join(outDir, 'inner.exit')
    fs.rmSync(exitFile, { force: true })
    const q = (s) => `'${String(s).replace(/'/g, `'\\''`)}'`
    fs.writeFileSync(script, `#!/bin/bash\nexport DI_MOVRIG_INNER=1\ncd ${q(RIG_REPO)}\n${q(process.execPath)} ${[fileURLToPath(import.meta.url), ...argv, '--out', outDir].map(q).join(' ')} 2>&1 | tee ${q(path.join(outDir, 'run.log'))}\necho \${PIPESTATUS[0]} > ${q(exitFile)}\n`)
    fs.chmodSync(script, 0o755)
    const socket = `di-movrig-${process.pid}`
    const env = { ...process.env, XDG_SESSION_TYPE: 'wayland' }
    delete env.DISPLAY; delete env.WAYLAND_DISPLAY
    console.log(`[rig] private display: kwin_wayland --virtual ${W}x${H} (socket ${socket}) → ${outDir}`)
    const r = spawnSync('kwin_wayland', ['--virtual', '--xwayland', '--socket', socket, '--width', String(W), '--height', String(H),
        '--no-lockscreen', '--no-global-shortcuts', '--no-kactivities', '--exit-with-session', script],
    { env, stdio: ['ignore', fs.openSync(path.join(outDir, 'kwin.log'), 'w'), fs.openSync(path.join(outDir, 'kwin.log'), 'a')], timeout: 45 * 60 * 1000 })
    if (r.error) { console.error(`[rig] kwin_wayland failed to start: ${r.error.message}`); process.exit(2) }
    const code = fs.existsSync(exitFile) ? Number(fs.readFileSync(exitFile, 'utf8').trim()) : 3
    if (code !== 0) console.error(`[rig] FAILED (exit ${code}) — see ${path.join(outDir, 'run.log')}`)
    else console.log(`[rig] done → ${path.join(outDir, 'report.md')}`)
    process.exit(code)
}

// ── inside the display ──────────────────────────────────────────────────────
const { chromium } = await import(path.join(RIG_REPO, 'node_modules', 'playwright', 'index.mjs'))
const { startStack } = await import('./stack.mjs')
const { SYNTH, MOXIR, seedSynthetic, publish, sha256File } = await import('./rooms.mjs')
const S = await import('./suites.mjs')
const { writeReport, contactSheets } = await import('./report.mjs')
const { snapshot, waitCool, acquireLock, DEFAULT_LOCK } = await import('./machine.mjs')

const say = (...a) => console.log(...a)
fs.mkdirSync(outDir, { recursive: true })
const rooms = String(arg('rooms', 'synthetic,moxir')).split(',')
const only = new Set(String(arg('only', 'move,look,fly,pacing,phone,eye')).split(','))
const token = `movrig-${process.pid}-${Date.now()}`

const results = {
    rig: { version: 1, rigCommit: (() => { try { return execFileSync('git', ['-C', RIG_REPO, 'rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim() } catch { return '' } })() },
    target: { worktree, branch, label: String(arg('label', branch)) },
    when: new Date().toISOString(),
    display: { nested: !!process.env.DI_MOVRIG_INNER, size, DISPLAY: process.env.DISPLAY },
    rooms: {}
}

let moxirBundle = null
if (rooms.includes('moxir')) {
    moxirBundle = arg('moxir-bundle') ? path.resolve(expand(arg('moxir-bundle'))) : path.join(outDir, 'moxir.space-bundle.tar.gz')
    if (!arg('moxir-bundle')) {
        const from = path.resolve(expand(arg('moxir-from', '~/.local/share/di.iiii/data')))
        say(`[rooms] exporting MOXIR from ${from} (read-only)`)
        execFileSync(process.execPath, [path.join(RIG_REPO, 'scripts', 'space-bundle.mjs'), 'export', 'moxir', '--data-root', from, '--out', moxirBundle], { stdio: 'inherit' })
    }
    results.moxirBundle = { file: moxirBundle, sha256: sha256File(moxirBundle), bytes: fs.statSync(moxirBundle).size }
}

// Frame times are only as good as the machine was idle and cool. Record it
// around every browser session, and gate each session on heat + the lock.
const lockFile = String(arg('lock', process.env.DI_BROWSER_LOCK || DEFAULT_LOCK))
const maxTemp = Number(arg('max-temp', 85))
results.machine = { atStart: snapshot() }
const BROWSER_ARGS = ['--ozone-platform=x11', '--force-device-scale-factor=1.5', `--window-size=${Math.round(W / 1.5)},${Math.round(H / 1.5)}`, '--window-position=0,0',
    '--ignore-gpu-blocklist', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows']
/** One short browser session: cool enough → hold the machine lock → launch → fn → close → release. */
async function session(name, fn) {
    const cool = await waitCool(maxTemp, { say })
    const release = await acquireLock(lockFile, { say })
    const before = snapshot()
    let browser = null
    try {
        // Playwright adds --enable-unsafe-swiftshader by default; take it away
        // so a missing GPU fails instead of falling back to the CPU.
        browser = await chromium.launch({ headless: false, args: BROWSER_ARGS, ignoreDefaultArgs: ['--enable-unsafe-swiftshader'] })
        results.browser = { version: browser.version() }
        return await fn(browser)
    } finally {
        if (browser) await browser.close().catch(() => {})
        release()
        ;(results.machine.sessions ||= []).push({ name, waitedForHeatMs: cool.waitedMs, before, after: snapshot() })
    }
}

const stack = await startStack({
    worktree, outDir, token, say,
    beforeServer: async ({ dataRoot }) => {
        if (!moxirBundle) return
        // The TARGET's importer, so the bundle lands in the shape that code reads.
        execFileSync(process.execPath, [path.join(worktree, 'scripts', 'space-bundle.mjs'), 'import', moxirBundle, '--data-root', dataRoot, '--force', '--no-backup'], { stdio: 'inherit', env: { ...process.env, DATA_ROOT: dataRoot } })
    }
})
results.target.commit = stack.commit
try {
    if (rooms.includes('synthetic')) await seedSynthetic(stack.api)
    if (rooms.includes('moxir')) await publish(stack.api, MOXIR.space, MOXIR.project)

    const eyeDir = path.join(outDir, 'eye')

    for (const roomName of rooms) {
        const room = roomName === 'moxir' ? MOXIR : SYNTH
        const R = results.rooms[roomName] = { desktop: {}, phone: {}, errors: [] }
        say(`\n[room] ${roomName}`)
        const guard = async (name, fn) => {
            try { return await fn() } catch (e) { say(`  [${name}] ERROR ${e.message.split('\n')[0]}`); return { error: e.message.split('\n')[0] } }
        }
        await session(`${roomName}-desktop`, async (browser) => {
        const desk = await browser.newContext({ viewport: null })
        // One page, one window, re-navigated between suites: every suite starts
        // from a fresh walker (a lock the walker marked broken stays broken).
        let current = null
        const open = async () => {
            const w = await S.openWalker(desk, stack.base, room, { say, reuse: current })
            current = w.page
            R.env = w.info
            return w.page
        }
        let page = await open()
        const cdp = await desk.newCDPSession(page)
        if (only.has('look')) {
            R.desktop.look = await guard('look', async () => {
                const { out, page: p } = await S.lookSuite(page, room, { say, reopen: async () => { page = await open(); return page } })
                page = p
                return out
            })
        }
        const degPerCount = R.desktop.look?.gain?.degPerCount || 0.6704
        if (only.has('move')) {
            page = await open()
            R.desktop.move = await guard('move', () => S.movementSuite(page, room, { say }))
            R.desktop.move.turnWhileWalking = await guard('turn', () => S.turnWhileWalking(page, room, degPerCount))
        }
        if (only.has('fly')) {
            page = await open()
            R.desktop.fly = await guard('fly', () => S.flySuite(page, room, { say }))
        }
        if (only.has('pacing')) {
            page = await open()
            R.desktop.pacing = await guard('pacing', () => S.pacingSuite(page, room, cdp, { say }))
        }
        if (only.has('eye')) {
            page = await open()
            const eye = S.screencaster(cdp, path.join(eyeDir, roomName))
            R.desktop.eye = await guard('eye', () => S.eyePass(page, room, eye, { say, degPerCount }))
        }
        R.errors.push(...new Set(current?.__rigErrors || []))
        await desk.close()
        })

        if (only.has('phone')) {
            await session(`${roomName}-phone`, async (browser) => {
                const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true })
                R.phone = await guard('phone', async () => {
                    const w = await S.openWalker(phone, stack.base, room, { phone: true, say })
                    R.phoneEnv = w.info
                    const pcdp = await phone.newCDPSession(w.page)
                    const eye = only.has('eye') ? S.screencaster(pcdp, path.join(eyeDir, roomName)) : null
                    const out = await S.phoneSuite(w.page, room, pcdp, { say, eye })
                    R.errors.push(...w.errors)
                    return out
                })
                await phone.close()
            })
        }
    }
} finally {
    stack.stop()
}

results.machine.atEnd = snapshot()
fs.writeFileSync(path.join(outDir, 'results.json'), JSON.stringify(results, null, 2))
if (only.has('eye')) contactSheets(path.join(outDir, 'eye'), say)
writeReport(results, path.join(outDir, 'report.md'))
say(`\n[rig] results → ${path.join(outDir, 'results.json')}\n[rig] report  → ${path.join(outDir, 'report.md')}`)
process.exit(0)
