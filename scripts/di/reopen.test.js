// @vitest-environment node
//
// `di` is the one word a person remembers. When they close the browser by
// mistake the server keeps running, so typing `di` again used to print
// "already running" and open nothing — they were left reading a URL. Now a
// second `di` (and `di up`) opens the browser too; `--no-open` still holds.
//
// Spawned against a stand-in server that answers the health probe, with a fake
// `xdg-open` first on PATH that writes down what it was asked to open.
import { afterEach, describe, expect, it } from 'vitest'
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const CLI = path.join(HERE, 'cli.mjs')

const cleanups = []
afterEach(async () => { while (cleanups.length) await cleanups.pop()() })

const tempDir = (prefix) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix))
    cleanups.push(() => fs.rmSync(dir, { recursive: true, force: true }))
    return dir
}

// A running di.iiii as far as `alive()` can tell: /serverXR/api/health is 200.
const standInServer = () => new Promise((resolve) => {
    const server = http.createServer((req, res) => {
        res.writeHead(200, { 'content-type': 'application/json' })
        res.end('{"ok":true}')
    })
    server.listen(0, '127.0.0.1', () => {
        cleanups.push(() => new Promise((done) => server.close(done)))
        resolve(server.address().port)
    })
})

const runningInstall = (port) => {
    const home = tempDir('di-reopen-')
    fs.mkdirSync(path.join(home, 'versions', '7.7.7-test'), { recursive: true })
    fs.symlinkSync(path.join(home, 'versions', '7.7.7-test'), path.join(home, 'current'))
    fs.writeFileSync(path.join(home, 'state.json'), JSON.stringify({ mode: 'node', version: '7.7.7-test' }))
    fs.writeFileSync(path.join(home, 'di.env'), `PORT=${port}\n`)
    return home
}

const fakeBrowser = () => {
    const bin = tempDir('di-reopen-bin-')
    const log = path.join(bin, 'opened.txt')
    fs.writeFileSync(path.join(bin, 'xdg-open'), `#!/bin/sh\necho "$@" >> "${log}"\n`, { mode: 0o755 })
    return { bin, opened: () => (fs.existsSync(log) ? fs.readFileSync(log, 'utf8').trim().split('\n') : []) }
}

// Not spawnSync: the stand-in server lives in this process and has to answer.
const di = (home, bin, args) => new Promise((resolve) => {
    const child = spawn(process.execPath, [CLI, ...args], {
        env: { ...process.env, DI_HOME: home, DI_NO_COLOR: '1', PATH: `${bin}${path.delimiter}${process.env.PATH}` },
        stdio: ['ignore', 'pipe', 'pipe']
    })
    let out = ''
    child.stdout.on('data', (chunk) => { out += chunk })
    child.stderr.on('data', (chunk) => { out += chunk })
    child.on('close', (code) => resolve({ code, out }))
})

// openBrowser detaches xdg-open; give it a moment to write.
const settle = () => new Promise((resolve) => setTimeout(resolve, 300))

describe.skipIf(process.platform !== 'linux')('di when it is already running', () => {
    it('opens the browser again — closing the window did not stop di.iiii', async () => {
        const port = await standInServer()
        const home = runningInstall(port)
        const browser = fakeBrowser()
        const { code, out } = await di(home, browser.bin, [])
        await settle()
        expect(code).toBe(0)
        expect(out).toContain('already running')
        expect(browser.opened()).toEqual([`http://localhost:${port}`])
    }, 20000)

    it('`di up` does the same, and --no-open still opens nothing', async () => {
        const port = await standInServer()
        const home = runningInstall(port)
        const browser = fakeBrowser()
        await di(home, browser.bin, ['up'])
        await settle()
        expect(browser.opened()).toHaveLength(1)
        await di(home, browser.bin, ['up', '--no-open'])
        await settle()
        expect(browser.opened()).toHaveLength(1)
    }, 20000)
})
