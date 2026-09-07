// @vitest-environment node
//
// `di open FILE` against a di.iiii that is actually running — the case the
// festival machine caught: the file went in, and every browser on the machine
// lost its server for it, while the page's own Open a file did not.
//
// A real install, as far as the CLI can tell: `current` points at a version
// directory laid out the way pack-runtime.mjs lays one out (cli/, scripts/,
// sdk/, serverXR/, release.json), and `di up` boots serverXR from it on a
// free port with a scratch data root. Nothing here touches ~/.di.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 })

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(HERE, '..', '..')

const freePort = () => new Promise((resolve, reject) => {
    const server = net.createServer()
    server.on('error', reject)
    server.listen(0, '127.0.0.1', () => {
        const { port } = server.address()
        server.close((error) => (error ? reject(error) : resolve(port)))
    })
})

const copyDir = (from, to, keep = () => true) => {
    fs.mkdirSync(to, { recursive: true })
    for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
        const src = path.join(from, entry.name)
        if (!keep(src)) continue
        if (entry.isDirectory()) copyDir(src, path.join(to, entry.name), keep)
        else fs.copyFileSync(src, path.join(to, entry.name))
    }
}

let home
let port
let di
let pidOf

beforeAll(async () => {
    home = fs.mkdtempSync(path.join(os.tmpdir(), 'di-open-'))
    port = await freePort()
    const version = '9.9.9-test'
    const versionDir = path.join(home, 'versions', version)
    const notATest = (file) => !/\.(test|spec)\.[cm]?js$/.test(file)
    copyDir(HERE, path.join(versionDir, 'cli'), notATest)
    copyDir(path.join(ROOT, 'sdk'), path.join(versionDir, 'sdk'), notATest)
    fs.mkdirSync(path.join(versionDir, 'scripts'))
    for (const script of ['space-bundle.mjs', 'install-bundle.mjs']) {
        fs.copyFileSync(path.join(ROOT, 'scripts', script), path.join(versionDir, 'scripts', script))
    }
    // The server and its dependencies are the checkout's own; symlinked, since
    // require() follows links and node_modules is not something to copy.
    fs.symlinkSync(path.join(ROOT, 'serverXR'), path.join(versionDir, 'serverXR'))
    fs.symlinkSync(path.join(ROOT, 'shared'), path.join(versionDir, 'shared'))
    fs.mkdirSync(path.join(versionDir, 'dist'))
    fs.writeFileSync(path.join(versionDir, 'release.json'), JSON.stringify({ version, profile: 'local', schemaVersion: 1 }))
    fs.symlinkSync(versionDir, path.join(home, 'current'))
    // lastUpdateCheck now: `di up` must not go looking for a release on the
    // network from inside a test.
    fs.writeFileSync(path.join(home, 'state.json'), JSON.stringify({ mode: 'node', version, lastUpdateCheck: new Date().toISOString() }))
    // A 1 MB wire, so the fallback below can be reached with a 2.5 MB file.
    fs.writeFileSync(path.join(home, 'di.env'), `PORT=${port}\nMAX_UPLOAD_MB=1\n`)

    di = (...args) => {
        const result = spawnSync(process.execPath, [path.join(home, 'current', 'cli', 'cli.mjs'), ...args], {
            cwd: home,
            encoding: 'utf8',
            timeout: 50_000,
            env: { ...process.env, DI_HOME: home, DI_NO_COLOR: '1' },
            stdio: ['ignore', 'pipe', 'pipe']
        })
        return { code: result.status, out: result.stdout, err: result.stderr }
    }
    pidOf = () => Number(fs.readFileSync(path.join(home, 'run', 'server.pid'), 'utf8'))

    const up = di('up', '--no-open')
    expect(up.out, up.err).toContain('di.iiii is running.')
})

afterAll(() => {
    if (!home) return
    di('down')
    try { process.kill(pidOf(), 'SIGKILL') } catch { /* already down */ }
    fs.rmSync(home, { recursive: true, force: true })
})

const api = (route) => fetch(`http://127.0.0.1:${port}/serverXR${route}`)

describe('di open FILE while di.iiii is running', () => {
    it('opens the file through the running server and leaves it running', async () => {
        const pid = pidOf()
        expect(di('new', 'show', 'one').out).toContain('made show-one.')
        const saved = di('save', 'show-one')
        expect(saved.out, saved.err).toContain('show-one → ')
        expect(fs.existsSync(path.join(home, 'show-one.diiii'))).toBe(true)

        const opened = di('open', 'show-one.diiii', '--as', 'show-two')
        expect(opened.out, opened.err).toContain('opened show-two.')
        expect(opened.out).not.toContain('starting')
        expect(opened.code).toBe(0)
        expect(pidOf()).toBe(pid)
        expect((await api('/api/spaces/show-two')).status).toBe(200)
    })

    it('passes a clash back in the server\'s own words, and still stops nothing', () => {
        const pid = pidOf()
        const again = di('open', 'show-one.diiii')
        expect(again.code).toBe(1)
        expect(again.err).toContain('A space called "show-one" is already here.')
        expect(again.err).toContain('Your di.iiii is unchanged.')
        expect(pidOf()).toBe(pid)
    })

    it('falls back to stopping the server only for a file the server will not take over the wire', async () => {
        const pid = pidOf()
        di('new', 'huge')
        const assets = path.join(home, 'data', 'spaces', 'huge', 'assets')
        fs.mkdirSync(assets, { recursive: true })
        // urandom does not compress: the .diiii stays over the 1 MB cap
        fs.writeFileSync(path.join(assets, 'blob.bin'), Buffer.from(Array.from({ length: 2_500_000 }, () => Math.floor(Math.random() * 256))))
        di('save', 'huge')

        const opened = di('open', 'huge.diiii', '--as', 'huge-two')
        expect(opened.out, opened.err).toContain('more than the running di.iiii takes over the wire')
        expect(opened.out).toContain('opened huge-two.')
        expect(opened.code).toBe(0)
        expect(pidOf()).not.toBe(pid)
        expect((await api('/api/spaces/huge-two')).status).toBe(200)
        expect(fs.statSync(path.join(home, 'data', 'spaces', 'huge-two', 'assets', 'blob.bin')).size).toBe(2_500_000)
    })
})

describe('di backup and di restore', () => {
    it('says what is in the file, and the light show is', () => {
        const data = path.join(home, 'data')
        const without = di('backup', '--out', 'b1.tar.gz')
        expect(without.out).toContain('inside: every space (scenes, projects, assets), and this di.iiii\'s settings.')
        expect(without.out).toContain('not inside: accounts, sign-ins and the AI chat history')
        expect(without.out).not.toContain('whole di.iiii')

        fs.mkdirSync(path.join(data, 'lighting'), { recursive: true })
        fs.writeFileSync(path.join(data, 'lighting', 'show.json'), JSON.stringify({ name: 'festival rig' }))
        const withShow = di('backup', '--out', 'b2.tar.gz')
        expect(withShow.out).toContain('inside: every space (scenes, projects, assets), the light show, and this di.iiii\'s settings.')
        const listed = spawnSync('tar', ['-tzf', path.join(home, 'b2.tar.gz')], { encoding: 'utf8' }).stdout
        expect(listed).toContain('./lighting/show.json')
    })

    it('puts the show back, with the server out of the way and then back up', async () => {
        const pid = pidOf()
        fs.rmSync(path.join(home, 'data', 'lighting'), { recursive: true, force: true })
        const restored = di('restore', 'b2.tar.gz', '--yes')
        expect(restored.code, restored.err).toBe(0)
        expect(restored.out).toContain('di.iiii is running.')
        expect(pidOf()).not.toBe(pid)
        expect(JSON.parse(fs.readFileSync(path.join(home, 'data', 'lighting', 'show.json'), 'utf8')).name).toBe('festival rig')
        expect((await api('/api/spaces/show-two')).status).toBe(200)
    })
})

describe('di mcp from an install', () => {
    it('introduces itself with the release version, not 0.0.0', () => {
        const result = spawnSync(process.execPath, [path.join(home, 'current', 'cli', 'cli.mjs'), 'mcp'], {
            encoding: 'utf8',
            timeout: 20_000,
            input: '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}\n',
            env: { ...process.env, DI_HOME: home, DI_NO_COLOR: '1' }
        })
        const answer = JSON.parse(result.stdout.trim().split('\n')[0])
        expect(answer.result.serverInfo.version).toBe('9.9.9-test')
    })
})
