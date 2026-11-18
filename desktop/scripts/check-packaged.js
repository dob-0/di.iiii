'use strict'
// Starts a PACKAGED app (where the Electron fuses act) and proves it loads a
// page: a fixture page on 127.0.0.1 is the address, the app's DevTools port
// (DI_DESKTOP_CDP, loopback only, off unless set) lists the page, the page
// title is the fixture's and not the offline page. Then the app is stopped by
// its pid. Needs a display: run under xvfb-run, never on a person's screen.
//   node scripts/check-packaged.js dist/linux-unpacked/di-desktop
//   DI_TEST_NO_SANDBOX=1   add --no-sandbox (CI runners without user namespaces)
const { spawn } = require('node:child_process')
const http = require('node:http')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const TITLE = 'packaged fixture page'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const getJson = (port) => new Promise((resolve) => {
    const req = http.get({ host: '127.0.0.1', port, path: '/json/list', timeout: 2000 }, (res) => {
        let body = ''
        res.on('data', (c) => { body += c })
        res.on('end', () => { try { resolve(JSON.parse(body)) } catch { resolve(null) } })
    })
    req.on('error', () => resolve(null))
    req.on('timeout', () => { req.destroy(); resolve(null) })
})

const freePort = () => new Promise((resolve) => {
    const s = http.createServer()
    s.listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => resolve(port)) })
})

const evalIn = (wsUrl, expression) => new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl)
    const timer = setTimeout(() => { ws.close(); reject(new Error('DevTools evaluate timed out')) }, 10000)
    ws.onopen = () => ws.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: { expression, returnByValue: true } }))
    ws.onmessage = (event) => {
        const msg = JSON.parse(event.data)
        if (msg.id !== 1) return
        clearTimeout(timer)
        ws.close()
        resolve(msg.result && msg.result.result ? msg.result.result.value : undefined)
    }
    ws.onerror = () => { clearTimeout(timer); reject(new Error('DevTools socket error')) }
})

// Starts the packaged app on `url`, waits for a page that `match` accepts,
// returns it with the evaluate helper; always stops the app by its pid.
const withApp = async (bin, url, match, use) => {
    const tmp = fs.mkdtempSync(path.join(process.env.TMPDIR || os.tmpdir(), 'di-packaged-'))
    const cdp = await freePort()
    const env = { ...process.env, DI_DESKTOP_URL: url, DI_DESKTOP_DATA_DIR: tmp, DI_DESKTOP_CDP: String(cdp) }
    delete env.WAYLAND_DISPLAY
    env.XDG_SESSION_TYPE = 'x11'
    const args = ['--ozone-platform=x11']
    if (process.env.DI_TEST_NO_SANDBOX) args.push('--no-sandbox')
    const child = spawn(path.resolve(bin), args, { env, stdio: ['ignore', 'pipe', 'pipe'] })
    let log = ''
    const keep = (c) => { log = (log + c).slice(-4000) }
    child.stdout.on('data', keep)
    child.stderr.on('data', keep)
    let exited = null
    child.on('exit', (code, signal) => { exited = { code, signal } })
    try {
        const end = Date.now() + 60000
        let page = null
        while (Date.now() < end && !exited && !page) {
            const list = await getJson(cdp)
            page = list && list.find((p) => p.type === 'page' && match(p))
            if (!page) await sleep(500)
        }
        if (!page) throw new Error(`no matching page (exited: ${JSON.stringify(exited)})\n${log}`)
        await use(page, cdp)
    } finally {
        if (!exited) {
            child.kill('SIGTERM')
            const end = Date.now() + 10000
            while (!exited && Date.now() < end) await sleep(100)
            if (!exited) child.kill('SIGKILL')
        }
        fs.rmSync(tmp, { recursive: true, force: true })
    }
}

const main = async () => {
    const bin = process.argv[2]
    if (!bin || !fs.existsSync(bin)) {
        process.stderr.write('usage: node scripts/check-packaged.js <packaged app binary>\n')
        return 2
    }
    if (!process.env.DISPLAY) {
        process.stderr.write('no DISPLAY: run under xvfb-run\n')
        return 2
    }
    const server = http.createServer((req, res) => {
        res.setHeader('content-type', 'text/html')
        res.end(`<!doctype html><meta charset="utf-8"><title>${TITLE}</title><h1>${TITLE}</h1>`)
    })
    await new Promise((r) => server.listen(0, '127.0.0.1', r))
    const url = `http://127.0.0.1:${server.address().port}/`
    try {
        await withApp(bin, url, (p) => p.title === TITLE && p.url === url, async (page, cdp) => {
            process.stdout.write(`packaged app loaded: ${page.url} title "${page.title}" (DevTools port ${cdp}, loopback)\n`)
        })
        // An address nobody listens on: the app must show its own offline page
        // through the di-offline scheme (the file protocol fuse is off).
        const dead = http.createServer()
        await new Promise((r) => dead.listen(0, '127.0.0.1', r))
        const deadUrl = `http://127.0.0.1:${dead.address().port}/`
        await new Promise((r) => dead.close(r))
        await withApp(bin, deadUrl, (p) => p.url.startsWith('di-offline://app/offline.html'), async (page) => {
            const h1 = await evalIn(page.webSocketDebuggerUrl, "document.querySelector('h1') && document.querySelector('h1').textContent")
            const address = await evalIn(page.webSocketDebuggerUrl, "document.querySelector('#address') && document.querySelector('#address').textContent")
            if (h1 !== 'di.iiii cannot be reached' || address !== deadUrl) throw new Error(`offline page content wrong: h1=${JSON.stringify(h1)} address=${JSON.stringify(address)}`)
            process.stdout.write(`packaged app offline page: ${page.url.split('?')[0]} h1 "${h1}" address ${address}\n`)
        })
        // The macOS and Windows guard, forced on here: the app says why and exits
        // with code 2 before any debugging port answers.
        const port = await freePort()
        const refused = spawn(path.resolve(bin), ['--ozone-platform=x11', ...(process.env.DI_TEST_NO_SANDBOX ? ['--no-sandbox'] : [])], {
            env: { ...process.env, DI_DESKTOP_REFUSE_CDP: '1', DI_DESKTOP_CDP: String(port), DI_DESKTOP_URL: url, DI_DESKTOP_DATA_DIR: os.tmpdir() },
            stdio: ['ignore', 'ignore', 'pipe']
        })
        let said = ''
        refused.stderr.on('data', (c) => { said += c })
        const code = await new Promise((resolve) => {
            const t = setTimeout(() => { refused.kill('SIGKILL'); resolve('timeout') }, 30000)
            refused.on('exit', (c) => { clearTimeout(t); resolve(c) })
        })
        if (code !== 2 || !said.includes('does not open a debugging port')) throw new Error(`guard: exit ${code}, said ${JSON.stringify(said.slice(0, 200))}`)
        if (await getJson(port)) throw new Error('guard: the debugging port answered')
        process.stdout.write(`packaged app guard forced on: exit 2, "${said.trim().slice(0, 60)}...", port ${port} closed\n`)
        return 0
    } catch (error) {
        process.stderr.write(`packaged app check failed: ${error.message}\n`)
        return 1
    } finally {
        await new Promise((r) => server.close(r))
    }
}

main().then((c) => process.exit(c), (e) => { process.stderr.write(`${e.stack}\n`); process.exit(1) })
