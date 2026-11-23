// @vitest-environment node
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { proposeBundle } from './space-proposal.mjs'

// `propose` over the threshold goes in parts. The threshold is lowered by env so
// a 12-byte file stands for the 843 MB one; fetch is a fake.
const BASE = 'https://dev.diiii.xyz/serverXR'
const door = `${BASE}/api/spaces/bundle/uploads`
let dir, file, out, saved
const KEYS = ['LIVE_API_TOKEN', 'DI_PROPOSE_SINGLE_MAX_BYTES', 'DI_OPEN_TO_RETRY_MS', 'DI_OPEN_TO_POLL_MS']

const reply = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body })

beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'di-propose-parts-'))
    file = path.join(dir, 'platina.diiii')
    fs.writeFileSync(file, 'bundle-bytes')
    saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]))
    process.env.LIVE_API_TOKEN = 'secret-token'
    process.env.DI_PROPOSE_SINGLE_MAX_BYTES = '5'
    process.env.DI_OPEN_TO_RETRY_MS = '0'
    process.env.DI_OPEN_TO_POLL_MS = '0'
    out = []
    vi.spyOn(console, 'log').mockImplementation((...a) => { out.push(a.join(' ')) })
})
afterEach(() => {
    vi.unstubAllGlobals(); vi.restoreAllMocks()
    for (const k of KEYS) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k] }
    fs.rmSync(dir, { recursive: true, force: true })
})

const fakeServer = ({ kind = 'proposal', final = { state: 'done', httpStatus: 202, status: 'pending_approval', approvalId: 'ap1', expiresAt: 1 } } = {}) => {
    const calls = []
    let startBody = null
    vi.stubGlobal('fetch', vi.fn(async (url, init = {}) => {
        calls.push(`${init.method || 'GET'} ${url.replace(door, '').replace(BASE, '')}`)
        expect(init.headers.Authorization).toBe('Bearer secret-token')
        if (url === door) { startBody = JSON.parse(init.body); return reply(201, { uploadId: 'u1', ...(kind ? { kind } : {}), partBytes: 5, parts: 3 }) }
        if (url.endsWith('/finish')) return reply(202, { state: 'joining' })
        if (!init.method) return reply(200, final)
        return reply(200, { ok: true })
    }))
    return { calls, startBody: () => startBody }
}

describe('propose over the threshold, in parts', () => {
    it('sends every part and finishes, then prints the proposal like the one-POST path', async () => {
        const server = fakeServer()
        const code = await proposeBundle([file, '--space', 'platina', '--from', 'Emilya', '--overwrite-newer'])
        expect(code).toBe(0)
        expect(server.calls).toEqual(['POST ', 'PUT /u1/parts/1', 'PUT /u1/parts/2', 'PUT /u1/parts/3', 'POST /u1/finish', 'GET /u1', 'DELETE /u1'])
        expect(server.startBody()).toMatchObject({ kind: 'proposal', name: 'platina.diiii', size: 12, proposal: { spaceId: 'platina', mode: 'propose', from: 'Emilya', dryRun: false, overwriteNewer: true } })
        expect(out.join('\n')).toContain('proposal ap1 is waiting for Apply / Reject')
        expect(out.join('\n')).not.toContain('secret-token')
    })

    it('dry run: asks for it, prints the dry run, creates nothing', async () => {
        const server = fakeServer({ final: { state: 'done', httpStatus: 200, status: 'dry_run', text: 'summary' } })
        const code = await proposeBundle([file, '--space', 'platina', '--dry-run'])
        expect(code).toBe(0)
        expect(server.startBody().proposal.dryRun).toBe(true)
        expect(out.join('\n')).toContain('dry run: nothing was created')
    })

    it('--direct and --accept-loss go to the server as the one-POST path sends them', async () => {
        const server = fakeServer()
        await proposeBundle([file, '--space', 'platina', '--direct', '--accept-loss', '3'])
        expect(server.startBody().proposal).toMatchObject({ mode: 'auto', acceptLoss: '3' })
    })

    it('a refusal from the server surfaces with its status and code, exit 1', async () => {
        fakeServer({ final: { state: 'failed', httpStatus: 409, error: 'The file removes 2 media items.', code: 'media_loss' } })
        const code = await proposeBundle([file, '--space', 'platina'])
        expect(code).toBe(1)
        expect(out.join('\n')).toContain('refused (409): The file removes 2 media items. [media_loss]')
    })

    it('a refusal at start (not signed in) surfaces and nothing is sent', async () => {
        const calls = []
        vi.stubGlobal('fetch', vi.fn(async (url, init = {}) => { calls.push(init.method || 'GET'); return reply(403, { error: 'Sign in with an account to send a file for this space.', code: 'auth_required' }) }))
        const code = await proposeBundle([file, '--space', 'platina'])
        expect(code).toBe(1)
        expect(calls).toEqual(['POST'])
        expect(out.join('\n')).toContain('[auth_required]')
    })

    it('a server that does not echo the kind is an older one: cancelled, no part sent, exit 1', async () => {
        const server = fakeServer({ kind: null })
        const code = await proposeBundle([file, '--space', 'platina'])
        expect(code).toBe(1)
        expect(server.calls).toEqual(['POST ', 'DELETE /u1'])
        expect(out.join('\n')).toContain('older version')
    })

    it('a file under the threshold keeps the one POST', async () => {
        process.env.DI_PROPOSE_SINGLE_MAX_BYTES = '1000'
        const calls = []
        vi.stubGlobal('fetch', vi.fn(async (url, init) => { calls.push(`${init.method} ${url.replace(BASE, '')}`); return reply(202, { status: 'pending_approval', approvalId: 'ap2', expiresAt: 1 }) }))
        const code = await proposeBundle([file, '--space', 'platina'])
        expect(code).toBe(0)
        expect(calls).toEqual(['POST /api/spaces/platina/proposals'])
    })
})
