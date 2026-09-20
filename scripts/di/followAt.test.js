// @vitest-environment node
//
// The ADDRESS PIN: `di follow <space> --from <name> --at <address>` — the name
// keeps doing its job, the socket goes to `address`. Written after a real rig
// found `--from https://local.thedi.studio` resolving, on the follower, to an
// address it could not reach; the fix without this was a hand edit of the OS
// hosts file, which needs admin.
import http from 'node:http'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'

import { parseArgs } from './args.mjs'
import { checkFollowable, resolveBase } from './share.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const CLI = path.join(HERE, 'cli.mjs')

describe('parsing --at', () => {
    it('takes the next token as its value, like --from and --key', () => {
        expect(parseArgs(['follow', 'jam', '--from', 'https://x', '--at', '100.87.4.12']))
            .toEqual({ _: ['follow', 'jam'], flags: { from: 'https://x', at: '100.87.4.12' } })
    })

    it('sits anywhere on the line beside the other follow flags', () => {
        expect(parseArgs(['follow', 'jam', '--at', '100.87.4.12', '--from', 'https://x', '--key', 'dii_sync_x']).flags)
            .toEqual({ at: '100.87.4.12', from: 'https://x', key: 'dii_sync_x' })
    })

    it('is absent, not false, when nobody typed it', () => {
        expect(parseArgs(['follow', 'jam', '--from', 'https://x']).flags.at).toBeUndefined()
    })
})

describe('`di follow --at` refuses a value that is not an address', () => {
    const homes = []
    afterEach(() => { while (homes.length) fs.rmSync(homes.pop(), { recursive: true, force: true }) })

    const installedHome = () => {
        const home = fs.mkdtempSync(path.join(os.tmpdir(), 'di-follow-at-'))
        homes.push(home)
        fs.mkdirSync(path.join(home, 'versions', '7.7.7-test'), { recursive: true })
        fs.symlinkSync(path.join(home, 'versions', '7.7.7-test'), path.join(home, 'current'))
        fs.writeFileSync(path.join(home, 'state.json'), JSON.stringify({ mode: 'node', version: '7.7.7-test' }))
        return home
    }

    const di = (home, args) => {
        const result = spawnSync(process.execPath, [CLI, ...args], {
            encoding: 'utf8',
            timeout: 15000,
            env: { ...process.env, DI_HOME: home, DI_NO_COLOR: '1' },
            stdio: ['ignore', 'pipe', 'pipe']
        })
        return { code: result.status, out: result.stdout, err: result.stderr }
    }

    it('a hostname, or anything else that is not an IPv4/IPv6 literal', () => {
        for (const bad of ['local.thedi.studio', 'not-an-ip', '999.1.1.1']) {
            const result = di(installedHome(), ['follow', 'jam', '--from', 'https://x', '--at', bad])
            expect(result.code, bad).toBe(1)
            expect(result.err, bad).toContain('is not an address')
            expect(result.err, bad).toContain('--at')
        }
    })

    it('accepts a real IPv4 or IPv6 literal and gets past the --at check', () => {
        // Both look like a real address to node:net.isIP, so validation passes
        // and the command moves on to actually reaching `--from` — which does
        // not exist here, so it fails for an unrelated reason, never for --at.
        for (const good of ['100.87.4.12', '::1', 'fe80::1']) {
            const result = di(installedHome(), ['follow', 'jam', '--from', 'http://127.0.0.1:1', '--at', good])
            expect(result.err, good).not.toContain('is not an address')
        }
    })

    it('is offered in the follow usage', () => {
        const result = di(installedHome(), ['follow', '--help'])
        expect(result.out).toContain('--at ADDRESS')
        expect(result.out).toContain('ADDRESS PIN')
    })
})

describe('the CLI pre-checks, pinned to an address', () => {
    let server = null
    let lastHost = null
    afterEach(async () => {
        if (!server) return
        await new Promise((resolve) => server.close(resolve))
        server = null
    })

    const startFakeHost = () => new Promise((resolve) => {
        server = http.createServer((req, res) => {
            lastHost = req.headers.host
            res.writeHead(200, { 'Content-Type': 'application/json' })
            if (req.url.startsWith('/serverXR/api/health')) {
                res.end(JSON.stringify({ ok: true, startedAt: 't1', port: 1 }))
            } else if (req.url.includes('/ops')) {
                res.end(JSON.stringify({ ops: [], latestVersion: 3 }))
            } else {
                res.end('{}')
            }
        })
        server.listen(0, '127.0.0.1', () => resolve(server.address().port))
    })

    it('resolveBase reaches a made-up hostname via the pinned address, Host header intact', async () => {
        const port = await startFakeHost()
        const resolved = await resolveBase(`http://caller.invalid:${port}`, { address: '127.0.0.1' })
        expect(resolved.base).toBe(`http://caller.invalid:${port}/serverXR`)
        expect(resolved.reason).toBeNull()
        expect(lastHost).toBe(`caller.invalid:${port}`)
    })

    it('checkFollowable does the same for the ops check that follows it', async () => {
        const port = await startFakeHost()
        const check = await checkFollowable({ base: `http://caller.invalid:${port}/serverXR`, spaceId: 'jam', key: null, address: '127.0.0.1' })
        expect(check.ok).toBe(true)
        expect(check.latestVersion).toBe(3)
        expect(lastHost).toBe(`caller.invalid:${port}`)
    })

    it('without an address, a hostname nothing can resolve fails cleanly', async () => {
        const resolved = await resolveBase('http://this-name-does-not-resolve.invalid.test')
        expect(resolved.base).toBeNull()
        expect(resolved.reason).toBe('unreachable')
    })
})
