// `di wifi`: what it prints, both ways, and the exit codes.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { runWifi } from './wifiCmd.mjs'

let home
beforeEach(() => { home = fs.mkdtempSync(path.join(os.tmpdir(), 'di-wificmd-')) })
afterEach(() => fs.rmSync(home, { recursive: true, force: true }))
const named = () => { fs.mkdirSync(path.join(home, 'name')); fs.writeFileSync(path.join(home, 'name', 'name.json'), JSON.stringify({ name: 'dob-a3f9.l.di-studio.xyz', label: 'dob-a3f9' })) }
const answer = (status, body, log = []) => async (url, init) => { log.push([init.method, url]); return { ok: status < 400, status, json: async () => body } }
const OPENED = { open: true, name: 'dob-a3f9.l.di-studio.xyz', address: '192.168.1.20', port: 443, since: 'x' }

describe('di wifi', () => {
    it('without a name: says run di name first, exit 2', async () => {
        const r = await runWifi({ flags: {}, home, base: 'b' })
        expect(r.code).toBe(2); expect(r.lines.join('\n')).toMatch(/di name first/i)
    })
    it('opens: POST, prints the name, address, link and the follow line', async () => {
        named(); const log = []
        const r = await runWifi({ flags: {}, home, base: 'http://x/serverXR', fetchImpl: answer(200, OPENED, log) })
        const text = r.lines.join('\n')
        expect(log).toEqual([['POST', 'http://x/serverXR/api/wifi-door']])
        expect(r.code).toBe(0)
        expect(text).toContain('dob-a3f9.l.di-studio.xyz'); expect(text).toContain('192.168.1.20:443')
        expect(text).toContain('https://dob-a3f9.l.di-studio.xyz/'); expect(text).toContain('di follow <space> --from dob-a3f9')
    })
    it('a port other than 443 is in the link', async () => {
        named()
        const r = await runWifi({ flags: {}, home, base: 'b', fetchImpl: answer(200, { ...OPENED, port: 4001 }) })
        expect(r.lines.join('\n')).toContain('https://dob-a3f9.l.di-studio.xyz:4001/')
    })
    it('--stop: DELETE, says private again', async () => {
        named(); const log = []
        const r = await runWifi({ flags: { stop: true }, home, base: 'b', fetchImpl: answer(200, { open: false }, log) })
        expect(log[0][0]).toBe('DELETE'); expect(r.lines[0]).toMatch(/Private again/)
    })
    it('--status: GET, private says so', async () => {
        named(); const log = []
        const r = await runWifi({ flags: { status: true }, home, base: 'b', fetchImpl: answer(200, { open: false }, log) })
        expect(log[0][0]).toBe('GET'); expect(r.lines[0]).toMatch(/^Private/)
    })
    it('--status while open prints the same lines as opening', async () => {
        named()
        const r = await runWifi({ flags: { status: true }, home, base: 'b', fetchImpl: answer(200, OPENED) })
        expect(r.lines[0]).toMatch(/^Open on the wifi/)
    })
    it('a refusal says why, exit 1', async () => {
        named()
        const r = await runWifi({ flags: {}, home, base: 'b', fetchImpl: answer(409, { error: 'no-network' }) })
        expect(r.code).toBe(1); expect(r.lines[0]).toMatch(/not on a network/)
    })
    it('a server that is not running says so, exit 1', async () => {
        named()
        const r = await runWifi({ flags: {}, home, base: 'b', fetchImpl: async () => { throw new Error('ECONNREFUSED') } })
        expect(r.code).toBe(1); expect(r.lines[0]).toMatch(/di up/)
    })
})
