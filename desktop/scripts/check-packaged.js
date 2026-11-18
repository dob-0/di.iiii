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
    const tmp = fs.mkdtempSync(path.join(process.env.TMPDIR || os.tmpdir(), 'di-packaged-'))
    const server = http.createServer((req, res) => {
        res.setHeader('content-type', 'text/html')
        res.end(`<!doctype html><meta charset="utf-8"><title>${TITLE}</title><h1>${TITLE}</h1>`)
    })
    await new Promise((r) => server.listen(0, '127.0.0.1', r))
    const url = `http://127.0.0.1:${server.address().port}/`
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
    let code = 1
    try {
        const end = Date.now() + 60000
        let page = null
        while (Date.now() < end && !exited && !page) {
            const list = await getJson(cdp)
            page = list && list.find((p) => p.type === 'page' && p.title === TITLE && p.url === url)
            if (!page) await sleep(500)
        }
        if (page) {
            process.stdout.write(`packaged app loaded: ${page.url} title "${page.title}" (DevTools port ${cdp}, loopback)\n`)
            code = 0
        } else {
            process.stderr.write(`packaged app did not load the fixture page (exited: ${JSON.stringify(exited)})\n${log}\n`)
        }
    } finally {
        if (!exited) {
            child.kill('SIGTERM')
            const end = Date.now() + 10000
            while (!exited && Date.now() < end) await sleep(100)
            if (!exited) child.kill('SIGKILL')
        }
        await new Promise((r) => server.close(r))
        fs.rmSync(tmp, { recursive: true, force: true })
    }
    return code
}

main().then((c) => process.exit(c), (e) => { process.stderr.write(`${e.stack}\n`); process.exit(1) })
