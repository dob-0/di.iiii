// @vitest-environment node
import http from 'node:http'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { COMMANDS, parseArgs } from './cli.mjs'

// `di move PROJECT --to SPACE` talks to the server's own route; it never
// touches a database. A tiny server stands in for the other di.iiii.
let server
afterEach(() => { server?.close(); server = null; vi.restoreAllMocks(); delete process.env.DI_TOKEN; process.exitCode = 0 })

const listen = (handler) => new Promise((resolve) => {
    server = http.createServer(handler).listen(0, '127.0.0.1', () => resolve(`http://127.0.0.1:${server.address().port}`))
})

describe('di move', () => {
    it('is a command', () => { expect(typeof COMMANDS.move).toBe('function') })

    it('posts the target, the flags and the token (from the environment, not an argument) and says where it went', async () => {
        let seen
        const url = await listen((req, res) => {
            let body = ''
            req.on('data', (c) => { body += c })
            req.on('end', () => {
                seen = { method: req.method, url: req.url, auth: req.headers.authorization, body: JSON.parse(body) }
                res.setHeader('Content-Type', 'application/json')
                res.end(JSON.stringify({ ok: true, projectId: 'drive-decisions', fromSpaceId: 'decisions', toSpaceId: 'what-we-have', stableLink: '/what-we-have/p/drive-decisions' }))
            })
        })
        process.env.DI_TOKEN = 'secret-token'
        const out = []
        vi.spyOn(process.stdout, 'write').mockImplementation((c) => { out.push(String(c)); return true })
        await COMMANDS.move(parseArgs(['move', 'drive-decisions', '--to', 'what-we-have', '--from', url, '--unpublish']))
        expect(seen).toEqual({
            method: 'POST', url: '/serverXR/api/projects/drive-decisions/move', auth: 'Bearer secret-token',
            body: { toSpace: 'what-we-have', unpublish: true, dryRun: false }
        })
        expect(out.join('\n')).toContain('/what-we-have/p/drive-decisions')
        expect(process.exitCode ?? 0).toBe(0)
    })

    it('shows the server\'s refusal and exits non-zero', async () => {
        const url = await listen((req, res) => { res.statusCode = 409; res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ error: 'slug already used' })) })
        const err = []
        vi.spyOn(process.stderr, 'write').mockImplementation((c) => { err.push(String(c)); return true })
        vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
        await COMMANDS.move(parseArgs(['move', 'x', '--to', 'y', '--from', url]))
        expect(err.join('\n')).toContain('slug already used')
        expect(process.exitCode).toBe(1)
    })

    it('asks which project and space when either is missing', async () => {
        vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
        vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
        await COMMANDS.move(parseArgs(['move', 'x']))
        expect(process.exitCode).toBe(1)
    })
})
