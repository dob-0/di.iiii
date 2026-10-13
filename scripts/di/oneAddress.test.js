// @vitest-environment node
//
// The one local address (docs/ai/one-local-address.md): http://diiii.localhost/
// opens THIS machine's di.iiii. `di status` prints it and `di open` opens it only
// when the address was asked and answered as this install — never assumed.
import { afterEach, describe, expect, it } from 'vitest'
import fs from 'node:fs'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'

import * as node from './runner-node.mjs'
import { probeDoorConfig } from './probe.mjs'
import { judgeOneAddress, oneAddress, oneLocalUrl, ONE_LOCAL_NAME } from './state.mjs'
import { ui } from './ui.mjs'

const dirs = []
const servers = []
afterEach(() => {
    for (const s of servers.splice(0)) s.close()
    for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true })
})
// a dot in the path, always (reference: the hidden-directory trap)
const installedHome = () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'di-one.address-'))
    dirs.push(home)
    fs.mkdirSync(path.join(home, 'versions', '1.0.0', 'serverXR', 'src'), { recursive: true })
    fs.symlinkSync(path.join(home, 'versions', '1.0.0'), path.join(home, 'current'))
    fs.writeFileSync(path.join(home, 'state.json'), JSON.stringify({ mode: 'node', version: '1.0.0' }))
    return home
}
const listen = (handler) => new Promise((resolve) => {
    const s = http.createServer(handler).listen(0, '127.0.0.1', () => { servers.push(s); resolve(s.address().port) })
})
const config = (id) => ({ machine: { id, name: 'm' }, local: true })

describe('the server is told its name by `di up`, and a machine can say no', () => {
    it('serverEnv carries DI_LOCAL_NAME=diiii.localhost by default', () => {
        const env = node.serverEnv({ home: installedHome(), port: 4391, base: {} })
        expect(env.DI_LOCAL_NAME).toBe('diiii.localhost')
        expect(env.DI_LOCAL).toBe('1')
    })

    it('di.env DI_LOCAL_NAME=off wins (a machine whose dev-router owns :80)', () => {
        const home = installedHome()
        fs.writeFileSync(path.join(home, 'di.env'), 'DI_LOCAL_NAME=off\n')
        expect(node.serverEnv({ home, port: 4391, base: {} }).DI_LOCAL_NAME).toBe('off')
    })
})

describe('judgeOneAddress: only the same machine id counts', () => {
    const self = config('aaa')
    it('the same di through :80 → the address', () => {
        expect(judgeOneAddress(self, { status: 200, config: config('aaa') })).toEqual({ url: 'http://diiii.localhost/', why: null })
    })
    it('nothing, another program, another di, a 421, or a silent self → no address, and why', () => {
        expect(judgeOneAddress(self, null).why).toMatch(/nothing answers on port 80/)
        expect(judgeOneAddress(self, { status: 200, config: null }).why).toMatch(/another program answers on port 80 \(HTTP 200\)/)
        expect(judgeOneAddress(self, { status: 200, config: config('bbb') }).why).toMatch(/opens another di\.iiii/)
        expect(judgeOneAddress(self, { status: 421, config: null }).why).toMatch(/not for diiii\.localhost/)
        expect(judgeOneAddress(null, { status: 200, config: config('aaa') }).why).toMatch(/did not say who it is/)
        for (const v of [null, { status: 200, config: null }]) expect(judgeOneAddress(self, v).url).toBeNull()
    })
    it('the link is the bare name, no port', () => {
        expect(ONE_LOCAL_NAME).toBe('diiii.localhost')
        expect(oneLocalUrl()).toBe('http://diiii.localhost/')
    })
})

describe('probeDoorConfig asks by address with the name as Host — no OS resolver involved', () => {
    it('sends Host: diiii.localhost to /serverXR/api/config and reads the answer', async () => {
        let seen = null
        const port = await listen((req, res) => {
            seen = { host: req.headers.host, url: req.url }
            res.writeHead(200, { 'content-type': 'application/json' })
            res.end(JSON.stringify({ config: config('aaa') }))
        })
        const got = await probeDoorConfig('diiii.localhost', { port })
        expect(seen).toEqual({ host: 'diiii.localhost', url: '/serverXR/api/config' })
        expect(got).toEqual({ status: 200, config: config('aaa') })
    })
    it('a page that is not JSON is an answer with no config; a closed port is null', async () => {
        const port = await listen((req, res) => { res.end('<!doctype html>index') })
        expect(await probeDoorConfig('diiii.localhost', { port })).toEqual({ status: 200, config: null })
        const closed = await listen(() => {})
        servers.pop().close()
        await new Promise((r) => setTimeout(r, 20))
        expect(await probeDoorConfig('diiii.localhost', { port: closed })).toBeNull()
    })
})

describe('oneAddress asks both sides', () => {
    it('passes the configured name to the door, and the default when this server\'s door is off', async () => {
        const home = installedHome()
        const asked = []
        const askSelf = async () => config('aaa')
        const askDoor = async (name) => { asked.push(name); return { status: 200, config: config('aaa') } }
        expect((await oneAddress(home, 4391, { askSelf, askDoor })).url).toBe('http://diiii.localhost/')
        fs.writeFileSync(path.join(home, 'di.env'), 'DI_LOCAL_NAME=off\n')
        expect((await oneAddress(home, 4391, { askSelf, askDoor })).url).toBe('http://diiii.localhost/')
        expect(asked).toEqual(['diiii.localhost', 'diiii.localhost'])
    })
})

describe('what status prints', () => {
    it('the address when it is this di, one dim reason when not', () => {
        expect(ui.oneAddress({ url: 'http://diiii.localhost/', why: null })).toContain('http://diiii.localhost/')
        expect(ui.oneAddress({ url: null, why: 'nothing answers on port 80' })).toContain('nothing answers on port 80')
    })
})
