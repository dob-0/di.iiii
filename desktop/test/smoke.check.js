'use strict'
// Smoke test: starts the real app (Electron under Playwright's _electron)
// against a fixture page on 127.0.0.1. Needs a display: run under xvfb-run or
// di-agent-screen exec, never on a person's own screen.
//   DI_TEST_NO_SANDBOX=1   add --no-sandbox (CI runners without user namespaces)
//   DI_DESKTOP_SHOTS=<dir> also write pictures at 1536x864 and 864x1536

const test = require('node:test')
const assert = require('node:assert/strict')
const http = require('node:http')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { _electron: electron } = require('playwright-core')

const appDir = path.join(__dirname, '..')
const SHOTS = process.env.DI_DESKTOP_SHOTS || ''
const SIZES = [[1536, 864], [864, 1536]]

const listen = (server) => new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server.address().port)))

const withTmp = () => fs.mkdtempSync(path.join(process.env.TMPDIR || os.tmpdir(), 'di-desktop-test-'))

const launch = async (url, extraEnv = {}) => {
    const tmp = withTmp()
    const env = { ...process.env, DI_DESKTOP_URL: url, DI_DESKTOP_DATA_DIR: tmp, DI_DESKTOP_EXTERNAL_LOG: path.join(tmp, 'external.log'), ...extraEnv }
    delete env.WAYLAND_DISPLAY
    env.XDG_SESSION_TYPE = 'x11'
    assert.ok(env.DISPLAY, 'no DISPLAY: run under xvfb-run or di-agent-screen exec')
    const args = [appDir, '--ozone-platform=x11']
    if (process.env.DI_TEST_NO_SANDBOX) args.push('--no-sandbox')
    const app = await electron.launch({ args, env, timeout: 60000 })
    const page = await app.firstWindow()
    return { app, page, tmp, externalLog: path.join(tmp, 'external.log') }
}

const shoot = async ({ app, page }, name) => {
    if (!SHOTS) return
    fs.mkdirSync(SHOTS, { recursive: true })
    for (const [w, h] of SIZES) {
        await app.evaluate(({ BrowserWindow }, [cw, ch]) => BrowserWindow.getAllWindows()[0].setContentSize(cw, ch), [w, h])
        await page.waitForTimeout(400)
        await page.screenshot({ path: path.join(SHOTS, `${name}-${w}x${h}.png`) })
    }
}

const readLog = (file) => (fs.existsSync(file) ? fs.readFileSync(file, 'utf8').split('\n').filter(Boolean) : [])
const waitFor = async (fn, ms = 8000) => {
    const end = Date.now() + ms
    while (Date.now() < end) {
        const value = await fn()
        if (value) return value
        await new Promise((r) => setTimeout(r, 100))
    }
    return null
}

const midi = () => (async () => {
    try {
        const access = await navigator.requestMIDIAccess({ sysex: true })
        return { ok: true, sysex: access.sysexEnabled }
    } catch (error) {
        return { ok: false, name: error.name }
    }
})()

test('app on a fixture page and on an unreachable address', async (t) => {
    let port
    const server = http.createServer((req, res) => {
        res.setHeader('content-type', 'text/html')
        if (req.url.startsWith('/redir')) { res.statusCode = 302; res.setHeader('location', `http://localhost:${port}/landed`); return res.end() }
        if (req.url.startsWith('/landed')) return res.end('<!doctype html><title>landed</title><p>frame after a redirect')
        if (req.url.startsWith('/frame')) return res.end('<!doctype html><title>frame</title><p>foreign frame')
        res.end(`<!doctype html><meta charset="utf-8"><title>fixture page</title>
<style>body{background:#000;color:#fff;font:18px system-ui;padding:32px}a{color:#4df9ff}iframe{width:60%;height:120px;border:1px solid #4df9ff}</style>
<h1>fixture page</h1><p>An allowed address. Links to other addresses leave the window.</p>
<p><a id="ext" target="_blank" href="http://localhost:${port}/ext">a link that opens a new window</a></p>
<iframe id="f" src="http://localhost:${port}/frame" allow="midi; camera"></iframe>
<p><button id="popup" onclick="window.open('http://localhost:${port}/popup')">window.open on click</button>
<button id="go" onclick="location.href='http://localhost:${port}/nav'">navigate on click</button></p>
<iframe id="g" src="${`http://127.0.0.1:${port}/redir`}"></iframe>`)
    })
    port = await listen(server)
    const allowedUrl = `http://127.0.0.1:${port}/`
    let main
    let offline
    try {
        await t.test('window, title, sandbox, permissions, gpu, external links', async (tt) => {
            main = await launch(allowedUrl)
            const { app, page, externalLog } = main
            await page.waitForLoadState('load')
            assert.equal(await page.title(), 'fixture page')
            assert.equal(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].getTitle()), 'di.iiii')
            assert.equal(await page.evaluate(() => typeof require), 'undefined', 'node must not reach the page')
            assert.equal(await page.evaluate(() => typeof process), 'undefined')

            const allowed = await page.evaluate(midi)
            tt.diagnostic(`midi on the allowed origin: ${JSON.stringify(allowed)}`)
            // A runner with no sound-card MIDI backend answers InvalidStateError: the
            // permission was granted, there is just nothing to open. A refusal by the
            // app's policy is NotAllowedError (or SecurityError).
            assert.ok(allowed.ok || allowed.name === 'InvalidStateError', `allowed origin must not be refused: ${JSON.stringify(allowed)}`)
            if (allowed.ok) assert.equal(allowed.sysex, true)

            const frame = await waitFor(() => page.frames().find((f) => f.url().startsWith(`http://localhost:${port}/frame`)))
            assert.ok(frame, 'foreign frame loaded')
            const refused = await frame.evaluate(midi)
            tt.diagnostic(`midi on a disallowed origin: ${JSON.stringify(refused)}`)
            assert.equal(refused.ok, false)
            assert.ok(['NotAllowedError', 'SecurityError'].includes(refused.name), `refused by policy, got ${refused.name}`)

            // A foreign frame never gets a camera stream. A machine with a camera
            // answers NotAllowedError (policy); a runner with none answers
            // NotFoundError before the policy is asked, so that is accepted too.
            // The refusal itself and the dialog on a di address are unit-tested.
            const cam = await frame.evaluate(async () => {
                try { await navigator.mediaDevices.getUserMedia({ video: true }); return 'stream' } catch (error) { return error.name }
            })
            tt.diagnostic(`camera in a foreign frame: ${cam}`)
            assert.ok(['NotAllowedError', 'SecurityError', 'NotFoundError'].includes(cam), `no camera stream in a foreign frame, got ${cam}`)

            const gpu = await page.evaluate(async () => {
                if (!('gpu' in navigator)) return { present: false }
                const adapter = await navigator.gpu.requestAdapter().catch((e) => `error: ${e.name}`)
                return { present: true, adapter: adapter === null ? null : typeof adapter === 'string' ? adapter : 'adapter' }
            })
            tt.diagnostic(`navigator.gpu: ${JSON.stringify(gpu)} (adapter null is expected on a software display)`)
            assert.equal(gpu.present, true)

            // A subframe that is redirected to another address loads as in a browser
            // tab: it is not cancelled and does not reach the system browser.
            const landed = await waitFor(() => page.frames().find((f) => f.url() === `http://localhost:${port}/landed`))
            assert.ok(landed, 'the redirected subframe loaded its target')
            assert.deepEqual(readLog(externalLog), [], 'a subframe redirect sent nothing to the system browser')

            // The system browser opens for a person, not for a script.
            await page.click('#ext')
            assert.ok(await waitFor(() => readLog(externalLog).includes(`http://localhost:${port}/ext`)), 'new-window link reached the system browser stub')
            await page.evaluate((p) => { for (let i = 0; i < 3; i++) window.open(`http://localhost:${p}/script${i}`) }, port)
            await page.waitForTimeout(1500)
            assert.deepEqual(readLog(externalLog), [`http://localhost:${port}/ext`], 'three scripted window.open calls with no input opened 0')
            await page.click('#popup')
            assert.ok(await waitFor(() => readLog(externalLog).includes(`http://localhost:${port}/popup`)), 'a click then one window.open opened 1')
            await page.waitForTimeout(1200)
            await page.click('#go', { noWaitAfter: true })
            assert.ok(await waitFor(() => readLog(externalLog).includes(`http://localhost:${port}/nav`)), 'navigation away after a click reached the stub')
            assert.equal(readLog(externalLog).length, 3, 'exactly the three opens a person made')
            assert.equal(page.url(), allowedUrl, 'the window stayed on the allowed address')
            assert.equal(app.windows().length, 1, 'no extra window opened')
            await shoot(main, 'fixture')
        })

        await t.test('an unreachable address shows the offline page with a retry link', async () => {
            const dead = http.createServer()
            const deadPort = await listen(dead)
            await new Promise((r) => dead.close(r))
            const deadUrl = `http://127.0.0.1:${deadPort}/`
            offline = await launch(deadUrl)
            const { page } = offline
            await waitFor(() => page.url().startsWith('file://'), 15000)
            assert.match(page.url(), /offline\.html/)
            assert.equal(await page.textContent('h1'), 'di.iiii cannot be reached')
            assert.equal(await page.textContent('#address'), deadUrl)
            assert.equal(await page.getAttribute('#retry', 'href'), deadUrl)
            await shoot(offline, 'offline')
        })
    } finally {
        for (const run of [main, offline]) {
            if (run) await run.app.close().catch(() => {})
            if (run) fs.rmSync(run.tmp, { recursive: true, force: true })
        }
        await new Promise((r) => server.close(r))
    }
})
