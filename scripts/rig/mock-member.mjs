#!/usr/bin/env node
/**
 * scripts/rig/mock-member.mjs — usage:
 *
 *   node scripts/rig/mock-member.mjs --port 0 [--host 127.0.0.1] [--base /serverXR]
 *     [--room <name>] [--key <secret>] [--id <uuid>] [--name <label>]
 *     [--release <version>] [--part studio|stage|hands] [--features '{"card":1}']
 *
 * A minimal, dependency-free stand-in for a real serverXR rig member,
 * faithful enough to docs/architecture/rig/PROTOCOL-1.md §2–§6 to self-test
 * conformance.mjs, start-member.mjs and compat-grid.mjs BEFORE serverXR's own
 * rig routes exist on this branch (they're lane A's files, built in
 * parallel). This is not lane A's rig/routes.js — do not treat it as a
 * reference implementation once serverXR/src/rig lands; PROTOCOL-1.md is the
 * one source of truth and this file gets deleted or kept only as a test
 * fixture if it ever disagrees.
 *
 * Implements: hello (§2.1, defaults, other-room 409, wrong-kind 400, agree
 * min-rule), card (§2.2, every key, honest nulls), cue (§2.3, ping/duplicate/
 * unknown-cue), blackout (§2.4), picture (§2.5, always not-yet), members
 * (§2.6), size limit 413 (§4.5), room key signing 403 (§5). Discovery (UDP,
 * §6) is intentionally NOT implemented — nothing in this lane's black-box
 * checklist exercises it over HTTP, and standing up a broadcast socket in a
 * throwaway self-test adds risk for no covered check.
 *
 * Run directly: prints one JSON line `{ "base", "pid", "id" }` once listening,
 * then stays up until SIGINT/SIGTERM.
 */

import { createServer as createHttpServer } from 'node:http'
import os from 'node:os'
import { parseArgs } from 'node:util'
import { randomUUID } from 'node:crypto'

import { LOCAL_FEATURES, agree, verify } from './lib.mjs'

const MAX_BODY_BYTES = 64 * 1024
const CUE_DEDUPE_MS = 60000
const MEMBER_TTL_MS = 20000

const parseCliArgs = (argv) => parseArgs({
    args: argv,
    options: {
        port: { type: 'string', default: '0' },
        host: { type: 'string', default: '127.0.0.1' },
        base: { type: 'string', default: '/serverXR' },
        room: { type: 'string' },
        key: { type: 'string' },
        id: { type: 'string' },
        name: { type: 'string' },
        release: { type: 'string', default: '0.0.0-mock' },
        part: { type: 'string', default: 'studio' },
        features: { type: 'string' },
        quiet: { type: 'boolean', default: false }
    }
}).values

const readRawBody = (req) => new Promise((resolve, reject) => {
    const chunks = []
    let total = 0
    let tooLarge = false
    req.on('data', (chunk) => {
        total += chunk.length
        if (total > MAX_BODY_BYTES) {
            tooLarge = true
            // Keep draining so the socket can close cleanly; stop buffering.
            return
        }
        chunks.push(chunk)
    })
    req.on('end', () => resolve({ raw: Buffer.concat(chunks).toString('utf8'), tooLarge }))
    req.on('error', reject)
})

const sendJson = (res, status, body) => {
    const text = JSON.stringify(body)
    res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' })
    res.end(text)
}

/** Builds the module for a single mock member. Exported for reuse/tests. */
export const createMockMember = (opts = {}) => {
    const id = opts.id || randomUUID()
    const name = opts.name || os.hostname() || id
    const release = opts.release || '0.0.0-mock'
    const part = opts.part || 'studio'
    const room = opts.room ?? null
    const base = opts.base || '/serverXR'
    const key = opts.key || null
    const features = opts.features || LOCAL_FEATURES
    let port = Number(opts.port) || 0

    const blackoutState = { on: false }
    const members = new Map() // id -> { machine, release, part, room, address, http, agreed, features, lastSeen, via }
    const cueIds = new Map() // id -> seenAt

    const pruneCueIds = () => {
        const cutoff = Date.now() - CUE_DEDUPE_MS
        for (const [cueId, seenAt] of cueIds) if (seenAt < cutoff) cueIds.delete(cueId)
    }
    const pruneMembers = () => {
        const cutoff = Date.now() - MEMBER_TTL_MS
        for (const [memberId, m] of members) if (m.lastSeen < cutoff) members.delete(memberId)
    }

    const ownHello = () => ({
        rig: 1,
        kind: 'hello',
        release,
        machine: { id, name },
        part,
        room,
        http: { port, base },
        features,
        sentAt: Date.now()
    })

    const expectKind = (body, kind) => {
        // §4.3: a future kind sent to a known route is 400 wrong-kind ONLY if
        // kind is present and different. A missing kind is accepted.
        if (body && Object.prototype.hasOwnProperty.call(body, 'kind') && body.kind !== kind) {
            return { rig: 1, error: 'wrong-kind' }
        }
        return null
    }

    const routes = {
        'GET /api/health': (req, res) => sendJson(res, 200, { ok: true, mock: true, id }),

        'POST /api/rig/hello': async (req, res, ctx) => {
            const wrongKind = expectKind(ctx.body, 'hello')
            if (wrongKind) return sendJson(res, 400, wrongKind)
            const body = ctx.body || {}
            if (body.rig !== 1) return sendJson(res, 400, { rig: 1, error: 'bad-hello' })
            const machineId = body.machine && typeof body.machine.id === 'string' ? body.machine.id : ''
            if (!machineId || machineId.length > 128) {
                return sendJson(res, 400, { rig: 1, error: 'bad-hello' })
            }
            const senderHello = {
                id: machineId,
                name: (body.machine && body.machine.name) || machineId,
                release: body.release || 'unknown',
                part: body.part || 'studio',
                room: body.room ?? null,
                http: {
                    port: (body.http && body.http.port) ?? req.socket.remotePort,
                    base: (body.http && body.http.base) || '/serverXR'
                },
                features: (body.features && typeof body.features === 'object') ? body.features : {}
            }
            if (senderHello.room !== room) {
                return sendJson(res, 409, { rig: 1, error: 'other-room' })
            }
            const agreed = agree(features, senderHello.features)
            members.set(senderHello.id, {
                machine: { id: senderHello.id, name: senderHello.name },
                release: senderHello.release,
                part: senderHello.part,
                room: senderHello.room,
                address: req.socket.remoteAddress,
                http: senderHello.http,
                agreed,
                features: senderHello.features,
                lastSeen: Date.now(),
                via: 'hello'
            })
            return sendJson(res, 200, { ...ownHello(), agreed })
        },

        'GET /api/rig/card': (req, res) => {
            sendJson(res, 200, {
                rig: 1,
                kind: 'card',
                release,
                machine: { id, name },
                part,
                partReason: 'mock member — no real hardware read',
                mode: 'jam',
                caller: null,
                blackout: blackoutState.on,
                ports: {
                    screens: [],
                    audioOut: [],
                    audioIn: [],
                    cameras: [],
                    serial: [],
                    midi: [],
                    net: []
                },
                health: {
                    tempC: null,
                    cpuPct: null,
                    memUsedMb: null,
                    memTotalMb: null,
                    throttled: null,
                    uptimeS: Math.floor(process.uptime())
                },
                shows: [{ output: null, url: null }],
                features,
                sentAt: Date.now()
            })
        },

        'POST /api/rig/cue': (req, res, ctx) => {
            const wrongKind = expectKind(ctx.body, 'cue')
            if (wrongKind) return sendJson(res, 400, wrongKind)
            const body = ctx.body || {}
            if (typeof body.id !== 'string' || !body.id || typeof body.name !== 'string' || !body.name) {
                return sendJson(res, 400, { rig: 1, error: 'bad-cue' })
            }
            pruneCueIds()
            if (cueIds.has(body.id)) {
                return sendJson(res, 200, { rig: 1, accepted: false, reason: 'duplicate' })
            }
            cueIds.set(body.id, Date.now())
            if (body.name === 'ping') {
                return sendJson(res, 200, { rig: 1, accepted: true, result: { at: Date.now() } })
            }
            if (body.name === 'reload' || body.name === 'show-page') {
                return sendJson(res, 200, { rig: 1, accepted: true, result: {} })
            }
            return sendJson(res, 200, { rig: 1, accepted: false, reason: 'unknown-cue' })
        },

        'POST /api/rig/blackout': (req, res, ctx) => {
            const wrongKind = expectKind(ctx.body, 'blackout')
            if (wrongKind) return sendJson(res, 400, wrongKind)
            const body = ctx.body || {}
            blackoutState.on = Boolean(body.on)
            return sendJson(res, 200, { rig: 1, blackout: blackoutState.on })
        },

        'POST /api/rig/picture': (req, res, ctx) => {
            const wrongKind = expectKind(ctx.body, 'picture')
            if (wrongKind) return sendJson(res, 400, wrongKind)
            return sendJson(res, 200, { rig: 1, accepted: false, reason: 'not-yet' })
        },

        'GET /api/rig/members': (req, res) => {
            pruneMembers()
            sendJson(res, 200, {
                rig: 1,
                self: ownHello(),
                members: [...members.values()]
            })
        }
    }

    const server = createHttpServer(async (req, res) => {
        try {
            const url = new URL(req.url, 'http://internal')
            let pathname = url.pathname
            if (base && pathname.startsWith(base)) pathname = pathname.slice(base.length) || '/'
            else if (base) {
                // Faithful to real mounting: a request outside our base doesn't exist.
                sendJson(res, 404, { rig: 1, error: 'not-found' })
                return
            }
            const routeKey = `${req.method} ${pathname}`
            const handler = routes[routeKey]
            if (!handler) {
                sendJson(res, 404, { rig: 1, error: 'not-found' })
                return
            }
            let ctx = {}
            if (req.method === 'POST') {
                const { raw, tooLarge } = await readRawBody(req)
                if (tooLarge) {
                    sendJson(res, 413, { rig: 1, error: 'too-large' })
                    return
                }
                if (key) {
                    const sig = req.headers['x-di-rig-sig']
                    if (!verify(key, raw, sig)) {
                        sendJson(res, 403, { rig: 1, error: 'room-key' })
                        return
                    }
                }
                let body = null
                if (raw) {
                    try {
                        body = JSON.parse(raw)
                    } catch {
                        sendJson(res, 400, { rig: 1, error: 'bad-json' })
                        return
                    }
                }
                ctx = { raw, body }
            }
            await handler(req, res, ctx)
        } catch (err) {
            sendJson(res, 500, { rig: 1, error: 'internal', detail: String(err && err.message || err) })
        }
    })

    return {
        id,
        name,
        listen: () => new Promise((resolve, reject) => {
            server.on('error', reject)
            server.listen(port, opts.host || '127.0.0.1', () => {
                port = server.address().port
                resolve({ base: `http://${opts.host || '127.0.0.1'}:${port}${base}`, port, id })
            })
        }),
        close: () => new Promise((resolve) => server.close(() => resolve())),
        server
    }
}

const isMain = () => {
    try {
        return import.meta.url === `file://${process.argv[1]}`
    } catch {
        return false
    }
}

if (isMain()) {
    const args = parseCliArgs(process.argv.slice(2))
    const member = createMockMember({
        port: Number(args.port || 0),
        host: args.host,
        base: args.base,
        room: args.room ?? null,
        key: args.key || null,
        id: args.id,
        name: args.name,
        release: args.release,
        part: args.part,
        features: args.features ? JSON.parse(args.features) : undefined
    })
    const info = await member.listen()
    process.stdout.write(`${JSON.stringify({ base: info.base, pid: process.pid, id: info.id })}\n`)
    if (!args.quiet) process.stderr.write(`[mock-member] listening on ${info.base} (pid ${process.pid})\n`)
    const shutdown = async () => {
        await member.close()
        process.exit(0)
    }
    process.on('SIGINT', shutdown)
    process.on('SIGTERM', shutdown)
}
