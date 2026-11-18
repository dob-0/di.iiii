// @vitest-environment node
//
// Every `di` command on a port held by ANOTHER program's server (2026-11-18, a
// Raspberry Pi whose standby di answered on :4000). #1306 fixed `di up`; here the
// rest (status, new) must not act on it either. It printed "already running" about a
// server that is not this install, and `di new` then said Unauthorized. A
// healthy answer on the port is not proof the server is ours: only the
// supervisor, the pid file, or a process out of this install's versions
// directory is.
import { afterEach, describe, expect, it, vi } from 'vitest'
import fs from 'node:fs'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'

import { main } from './cli.mjs'

const dirs = []
const servers = []
afterEach(() => {
    delete process.env.DI_HOME
    process.exitCode = undefined
    for (const s of servers.splice(0)) s.close()
    for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true })
})

// eslint-disable-next-line no-control-regex
const plain = (text) => String(text).replace(/\u001b\[[0-9;]*m/g, '')

// a dot in the path, always (reference: the hidden-directory trap)
const installedHome = (port = null) => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'di-port.taken-'))
    dirs.push(home)
    fs.mkdirSync(path.join(home, 'versions', '1.0.0', 'serverXR', 'src'), { recursive: true })
    fs.symlinkSync(path.join(home, 'versions', '1.0.0'), path.join(home, 'current'))
    fs.writeFileSync(path.join(home, 'state.json'), JSON.stringify({ mode: 'node', version: '1.0.0' }))
    if (port) fs.writeFileSync(path.join(home, 'di.env'), `PORT=${port}\n`)
    return home
}

// somebody else's server: answers the health check on a free port
const strangerOnAPort = async () => {
    const server = http.createServer((req, res) => res.end(req.url === '/serverXR/api/health' ? '{"ok":true}' : '{}'))
    servers.push(server)
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
    return server.address().port
}

const run = async (home, ...argv) => {
    process.env.DI_HOME = home
    const before = process.argv
    process.argv = ['node', 'di', ...argv]
    const out = []
    const spyOut = vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => { out.push(String(chunk)); return true })
    const spyErr = vi.spyOn(process.stderr, 'write').mockImplementation((chunk) => { out.push(String(chunk)); return true })
    try { await main() } finally { spyOut.mockRestore(); spyErr.mockRestore(); process.argv = before }
    return plain(out.join(''))
}

describe('other di commands when something else answers on the port', () => {
    for (const argv of [['status'], ['new', 'my-space']]) {
        it(`di ${argv[0]} says the port is held by another program, exits 1, never talks to it`, async () => {
            const port = await strangerOnAPort()
            const text = await run(installedHome(port), ...argv)
            expect(text).toMatch(new RegExp(`port ${port} is held by another program`))
            expect(text).not.toMatch(/Unauthorized|already running|not running/)
        })
    }

    it('di status on this install\'s own server does not say held', async () => {
        const port = await strangerOnAPort()
        const home = installedHome(port)
        fs.mkdirSync(path.join(home, 'run'), { recursive: true })
        fs.writeFileSync(path.join(home, 'run', 'server.pid'), String(process.pid))
        const text = await run(home, 'status')
        expect(text).not.toMatch(/held by another program/)
    })
})
