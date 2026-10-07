// @vitest-environment node
//
// The place address against the REAL server (serverXR/src/guestAddress.js,
// wired in index.js): the name comes from the certificate the server actually
// serves, and an install with no certificate gives no address at all.
// Loopback binds only — a test never puts a server on the wifi — so the
// certificate case answers 'not-on-network', which is exactly what such a
// start is.
import { execFileSync } from 'node:child_process'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import http from 'node:http'
import https from 'node:https'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { spawnServerUntilReady } from './testSupport/spawnServer.mjs'

vi.setConfig({ testTimeout: 25_000, hookTimeout: 40_000 })

const SERVER_ENTRY = path.join(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), 'src/index.js')
const cleanups = []
afterEach(async () => { for (const c of cleanups.splice(0).reverse()) await c() })

const start = async ({ withCert }) => {
    const base = await mkdtemp(path.join(os.tmpdir(), 'dii-guest-address-'))
    const client = path.join(base, 'dist')
    await mkdir(client, { recursive: true })
    await writeFile(path.join(client, 'index.html'), '<div id="root"></div>')
    const data = path.join(base, 'data')
    await mkdir(data)
    const tlsEnv = {}
    if (withCert) {
        tlsEnv.TLS_CERT = path.join(base, 'cert.pem')
        tlsEnv.TLS_KEY = path.join(base, 'key.pem')
        execFileSync('openssl', ['req', '-x509', '-newkey', 'ec', '-pkeyopt', 'ec_paramgen_curve:P-256',
            '-keyout', tlsEnv.TLS_KEY, '-out', tlsEnv.TLS_CERT, '-days', '1', '-nodes',
            '-subj', '/CN=hall.guest.test', '-addext', 'subjectAltName=DNS:hall.guest.test'], { stdio: 'ignore' })
    }
    const env = { ...process.env }
    delete env.TLS_CERT
    delete env.TLS_KEY
    const { child, port } = await spawnServerUntilReady({
        entry: SERVER_ENTRY,
        cwd: base,
        env: {
            ...env,
            NODE_ENV: 'production', DI_LOCAL: '1', HOST: '127.0.0.1', APP_BASE_PATH: '/serverXR', CLIENT_DIR: client,
            DATA_ROOT: data, REQUIRE_AUTH: 'false', AUTH_SESSION_SECRET: 'test-session-secret', AUTH_SESSION_COOKIE_SECURE: 'false',
            DI_RIG: '0', ...tlsEnv
        }
    })
    cleanups.push(async () => {
        if (child.exitCode === null) { child.kill('SIGTERM'); await new Promise((r) => { child.once('exit', r); setTimeout(r, 3000) }) }
        await rm(base, { recursive: true, force: true })
    })
    return port
}

const get = (port, secure) => new Promise((resolve, reject) => {
    const lib = secure ? https : http
    lib.get({ host: '127.0.0.1', port, path: '/serverXR/api/guest-address', rejectUnauthorized: false, servername: 'hall.guest.test' }, (res) => {
        let body = ''
        res.on('data', (d) => { body += d })
        res.on('end', () => resolve({ status: res.statusCode, body }))
    }).on('error', reject)
})

describe('GET /api/guest-address on the real server', () => {
    it('no certificate: no address, and the setting named', async () => {
        const port = await start({ withCert: false })
        const res = await get(port, false)
        expect(res.status).toBe(200)
        const { guest } = JSON.parse(res.body)
        expect(guest).toMatchObject({ state: 'no-certificate', address: null, lan: false })
        expect(guest.setting).toContain('~/.di/tls/cert.pem')
    })

    it('with a certificate: the name it serves, on its own port, and a loopback start says so', async () => {
        const port = await start({ withCert: true })
        const res = await get(port, true)
        expect(res.status).toBe(200)
        const { guest } = JSON.parse(res.body)
        expect(guest).toMatchObject({
            state: 'not-on-network',
            name: 'hall.guest.test',
            address: `https://hall.guest.test:${port}/`,
            command: 'di up --lan'
        })
    })
})
