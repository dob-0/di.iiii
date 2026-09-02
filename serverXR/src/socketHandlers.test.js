// @vitest-environment node

import http from 'node:http'
import { createRequire } from 'node:module'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const { io: ioClient } = require('socket.io-client')
const { getSocketPath, applyFreshDbIdentity, initializeSocket } = require('./socketHandlers.js')
const { initDb, closeDb } = require('./db.js')

describe('getSocketPath', () => {
    it('returns the root socket path when base path is empty', () => {
        expect(getSocketPath('')).toBe('/socket.io')
        expect(getSocketPath('/')).toBe('/socket.io')
    })

    it('appends socket.io to normalized base paths', () => {
        expect(getSocketPath('/serverXR')).toBe('/serverXR/socket.io')
        expect(getSocketPath('custom')).toBe('/custom/socket.io')
        expect(getSocketPath('/nested/app/')).toBe('/nested/app/socket.io')
    })
})

// A socket's io.use middleware resolves authState once, at connect. HTTP
// requests re-check role/spaces/isUnrestricted against the DB on every
// request (readAuthSession -> getFreshDbIdentity); without this, an admin
// downgrading a user's role or revoking their space scope mid-session never
// reaches an already-open tab's live socket connection — it keeps
// broadcasting/receiving scene, cursor and chat events for a space it was
// just cut off from, for as long as the connection stays open.
describe('applyFreshDbIdentity', () => {
    it('overrides a stale session authState with the current DB role/spaces/isUnrestricted', () => {
        const stale = {
            authenticated: true,
            type: 'session',
            role: 'editor',
            subject: 'user-1',
            spaces: ['wcc'],
            isUnrestricted: false
        }
        const config = {
            getFreshDbIdentity: (subject) => {
                expect(subject).toBe('user-1')
                return { dbRole: 'viewer', dbSpaces: [], dbUnrestricted: false }
            }
        }
        const next = applyFreshDbIdentity(stale, config)
        expect(next.role).toBe('viewer')
        expect(next.spaces).toEqual([])
        expect(next.isUnrestricted).toBe(false)
    })

    it('leaves authState untouched when the DB has no row for the subject (guest/token identity)', () => {
        const stale = { authenticated: true, type: 'session', role: 'editor', subject: 'guest:abc', spaces: null }
        const config = { getFreshDbIdentity: () => null }
        expect(applyFreshDbIdentity(stale, config)).toBe(stale)
    })

    it('is a no-op when the connection config has no DB lookup wired up', () => {
        const stale = { authenticated: true, type: 'session', role: 'editor', subject: 'user-1', spaces: null }
        expect(applyFreshDbIdentity(stale, {})).toBe(stale)
    })
})

describe('socket handlers survive a null payload', () => {
  const http = require('node:http')
  const { io: ioClient } = require('socket.io-client')
  const { initializeSocket } = require('./socketHandlers.js')
  const BASE = '/serverXR'
  let httpServer
  let io
  let url

  beforeAll(async () => {
    httpServer = http.createServer((req, res) => { res.writeHead(200); res.end('ok') })
    io = initializeSocket(httpServer, { basePath: BASE, requireAuth: false, corsOrigins: [] })
    await new Promise((r) => httpServer.listen(0, '127.0.0.1', r))
    url = `http://127.0.0.1:${httpServer.address().port}`
  })

  afterAll(async () => {
    io?.close?.()
    await new Promise((r) => httpServer.close(r))
  })

  it('ignores null for every space event instead of throwing out of the listener', async () => {
    const client = ioClient(url, { path: `${BASE}/socket.io`, transports: ['websocket'] })
    await new Promise((resolve, reject) => {
      client.on('connect', resolve)
      client.on('connect_error', reject)
    })
    const events = [
      'join-space', 'join-project', 'scene-update', 'object-changed', 'object-added',
      'object-deleted', 'user-cursor', 'project-cursor', 'project-chat-message',
      'space-chat-message', 'space-chat-remove', 'selection-changed'
    ]
    for (const event of events) client.emit(event, null)
    await new Promise((r) => setTimeout(r, 150))
    expect(client.connected).toBe(true)
    expect(io.engine.clientsCount).toBe(1)
    client.close()
    await new Promise((r) => setTimeout(r, 50))
  })
})

// A chat line skips multer and the JSON body parser entirely, so the HTTP
// disk-full guard (diskGuard.js/createDiskWriteGuard, wired in index.js)
// never sees it. Without a socket-side check of its own, a guest could keep
// filling the data volume through chat after every HTTP write is refused.
describe('space-chat-message disk guard', () => {
    let httpServer

    const startServer = (config) => new Promise((resolve) => {
        httpServer = http.createServer()
        initializeSocket(httpServer, config)
        httpServer.listen(0, '127.0.0.1', () => resolve(httpServer.address().port))
    })

    const connectClient = (port) => new Promise((resolve, reject) => {
        const client = ioClient(`http://127.0.0.1:${port}`, {
            path: getSocketPath(''),
            transports: ['websocket'],
            reconnection: false
        })
        const timeout = setTimeout(() => reject(new Error('client did not connect')), 2000)
        client.on('connect', () => { clearTimeout(timeout); resolve(client) })
        client.on('connect_error', (error) => { clearTimeout(timeout); reject(error) })
    })

    const waitForEvent = (socket, event, timeoutMs) => new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error(`timed out waiting for ${event}`)), timeoutMs)
        socket.once(event, (payload) => { clearTimeout(timeout); resolve(payload) })
    })

    afterEach(async () => {
        if (httpServer) await new Promise((r) => httpServer.close(r))
        httpServer = null
    })

    it('drops a space chat message without broadcasting it when free disk is below the configured floor', async () => {
        const port = await startServer({
            requireAuth: false,
            minFreeDiskBytes: 500 * 1024 * 1024,
            directories: { dataDir: '/tmp' },
            // ~40KB free — comfortably under the 500MB floor.
            diskStatfs: async () => ({ bavail: 10, bsize: 4096 })
        })
        const sender = await connectClient(port)
        const listener = await connectClient(port)
        listener.emit('join-space', { spaceId: 'floor-test', userId: 'listener', userName: 'Listener', chat: false })
        sender.emit('join-space', { spaceId: 'floor-test', userId: 'sender', userName: 'Sender', chat: false })
        await new Promise((r) => setTimeout(r, 50))

        sender.emit('space-chat-message', { spaceId: 'floor-test', text: 'hello', userId: 'sender', userName: 'Sender' })

        await expect(waitForEvent(listener, 'space-chat-message', 300)).rejects.toThrow()
        sender.close()
        listener.close()
    })

    it('still broadcasts and persists a space chat message when free disk is comfortably above the floor', async () => {
        initDb(':memory:')
        try {
            const port = await startServer({
                requireAuth: false,
                minFreeDiskBytes: 500 * 1024 * 1024,
                directories: { dataDir: '/tmp' },
                // ~40GB free.
                diskStatfs: async () => ({ bavail: 10 * 1024 * 1024, bsize: 4096 })
            })
            const sender = await connectClient(port)
            const listener = await connectClient(port)
            listener.emit('join-space', { spaceId: 'floor-ok', userId: 'listener', userName: 'Listener', chat: false })
            sender.emit('join-space', { spaceId: 'floor-ok', userId: 'sender', userName: 'Sender', chat: false })
            await new Promise((r) => setTimeout(r, 50))

            sender.emit('space-chat-message', { spaceId: 'floor-ok', text: 'hello', userId: 'sender', userName: 'Sender' })
            const payload = await waitForEvent(listener, 'space-chat-message', 1000)
            expect(payload.text).toBe('hello')
            sender.close()
            listener.close()
        } finally {
            closeDb()
        }
    })
})
