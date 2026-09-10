// @vitest-environment node

import http from 'node:http'
import { createRequire } from 'node:module'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const { io: ioClient } = require('socket.io-client')
const {
    getSocketPath, applyFreshDbIdentity, initializeSocket, wroteSpaceChatLine,
    chatChannelOf, chatStoreKey, chatSocketRoom, STAFF_CHANNEL
} = require('./socketHandlers.js')
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

// Reply, pin and "delete my own line" are the three things the room's tools
// added to this wire. Each of them changes who may do what, so each is tested
// against the wire rather than against the store it happens to call.
describe('the room tools on the wire', () => {
    let httpServer

    const startServer = (config) => new Promise((resolve) => {
        httpServer = http.createServer()
        initializeSocket(httpServer, config)
        httpServer.listen(0, '127.0.0.1', () => resolve(httpServer.address().port))
    })

    const connectClient = (port) => new Promise((resolve, reject) => {
        const client = ioClient(`http://127.0.0.1:${port}`, {
            path: getSocketPath(''), transports: ['websocket'], reconnection: false
        })
        const timeout = setTimeout(() => reject(new Error('client did not connect')), 2000)
        client.on('connect', () => { clearTimeout(timeout); resolve(client) })
        client.on('connect_error', (error) => { clearTimeout(timeout); reject(error) })
    })

    const waitForEvent = (socket, event, timeoutMs) => new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error(`timed out waiting for ${event}`)), timeoutMs)
        socket.once(event, (payload) => { clearTimeout(timeout); resolve(payload) })
    })

    const ROOM_CONFIG = {
        requireAuth: false,
        minFreeDiskBytes: 0,
        directories: { dataDir: '/tmp' },
        diskStatfs: async () => ({ bavail: 10 * 1024 * 1024, bsize: 4096 })
    }

    const openRoom = async (spaceId) => {
        const port = await startServer(ROOM_CONFIG)
        const a = await connectClient(port)
        const b = await connectClient(port)
        a.emit('join-space', { spaceId, userId: 'writer', userName: 'Writer', chat: true })
        b.emit('join-space', { spaceId, userId: 'other', userName: 'Other', chat: true })
        await new Promise((r) => setTimeout(r, 80))
        return { a, b }
    }

    afterEach(async () => {
        if (httpServer) await new Promise((r) => httpServer.close(r))
        httpServer = null
        closeDb()
    })

    it('carries a reply with its quote, and cuts the quote to a quote', async () => {
        initDb(':memory:')
        const { a, b } = await openRoom('tools-reply')
        a.emit('space-chat-message', {
            spaceId: 'tools-reply', id: 'm1', userId: 'writer', userName: 'Writer', text: 'the door code is 4417'
        })
        await waitForEvent(b, 'space-chat-message', 1000)

        b.emit('space-chat-message', {
            spaceId: 'tools-reply',
            id: 'm2',
            userId: 'other',
            userName: 'Other',
            text: 'got it',
            replyTo: { id: 'm1', userName: 'Writer', text: 'x'.repeat(500) }
        })
        const answer = await waitForEvent(a, 'space-chat-message', 1000)
        expect(answer.replyTo.id).toBe('m1')
        expect(answer.replyTo.text.length).toBe(160)
        a.close()
        b.close()
    })

    it('will not let a guest pin one line at the top of the room for everybody', async () => {
        initDb(':memory:')
        const { a, b } = await openRoom('tools-pin')
        a.emit('space-chat-message', {
            spaceId: 'tools-pin', id: 'p1', userId: 'writer', userName: 'Writer', text: 'read this first'
        })
        await waitForEvent(b, 'space-chat-message', 1000)

        a.emit('space-chat-pin', { spaceId: 'tools-pin', id: 'p1' })
        const refusal = await waitForEvent(a, 'space-chat-forbidden', 1000)
        expect(refusal.message).toMatch(/sign in/i)
        await expect(waitForEvent(b, 'space-chat-pinned', 300)).rejects.toThrow()
        a.close()
        b.close()
    })

    it('says on join whether this browser may pin, and what is pinned', async () => {
        initDb(':memory:')
        const port = await startServer(ROOM_CONFIG)
        const client = await connectClient(port)
        client.emit('join-space', { spaceId: 'tools-history', userId: 'writer', userName: 'Writer', chat: true })
        const history = await waitForEvent(client, 'space-chat-history', 1000)
        expect(history.canPin).toBe(false)
        expect(history.pinned).toBeNull()
        client.close()
    })
})

// The rule behind "you can delete your own message". Read it here rather than
// through a socket: with auth turned off every connection is an admin, so a
// server-level test of the refusal would only be testing the admin path.
describe('who wrote this line', () => {
    const line = (extra = {}) => ({ id: 'm1', userId: 'chat-user-7', accountId: null, ...extra })

    it('an account owns the line it is stamped on, and no other', () => {
        expect(wroteSpaceChatLine({ line: line({ accountId: 'a1' }), accountId: 'a1' })).toBe(true)
        expect(wroteSpaceChatLine({ line: line({ accountId: 'a1' }), accountId: 'a2' })).toBe(false)
    })

    it('a signed-in person does not own a guest line that happens to share a label', () => {
        expect(wroteSpaceChatLine({
            line: line(), accountId: 'a1', socketUserId: 'chat-user-7'
        })).toBe(false)
    })

    it('a guest owns its own line by the label its socket joined with', () => {
        expect(wroteSpaceChatLine({ line: line(), socketUserId: 'chat-user-7' })).toBe(true)
        expect(wroteSpaceChatLine({ line: line(), socketUserId: 'chat-user-8' })).toBe(false)
    })

    // The one that matters: a guest must not be able to reach an account's
    // line by claiming that account's display id.
    it('a guest never owns a line written by an account', () => {
        expect(wroteSpaceChatLine({
            line: line({ accountId: 'a1' }), socketUserId: 'chat-user-7'
        })).toBe(false)
    })

    it('owns nothing when there is no line, and nothing when there is no identity', () => {
        expect(wroteSpaceChatLine({ line: null, accountId: 'a1' })).toBe(false)
        expect(wroteSpaceChatLine({ line: line() })).toBe(false)
    })
})


// A space has two rooms. They are the same machinery with one key between them,
// and the whole safety of that rests on the key: a staff room that could be
// addressed as a space, or that shared a socket room with the open one, would
// be a private room in name only.
describe('the space\'s two rooms', () => {
    it('reads anything that is not the staff word as the open room', () => {
        expect(chatChannelOf('staff')).toBe(STAFF_CHANNEL)
        expect(chatChannelOf('room')).toBe('room')
        expect(chatChannelOf('Staff')).toBe('room')
        expect(chatChannelOf(undefined)).toBe('room')
        expect(chatChannelOf('../main')).toBe('room')
    })

    // A space id is /^[a-z0-9-]{3,48}$/ (spaceStore.SLUG_REGEX), so `#` cannot
    // appear in one — which is what makes this key unreachable by naming a
    // space after it.
    it('keys the staff room where no space id can ever reach', () => {
        expect(chatStoreKey('main', 'staff')).toBe('main#staff')
        expect(chatStoreKey('main', 'room')).toBe('main')
        expect(chatStoreKey('main', 'staff')).not.toMatch(/^[a-z0-9-]+$/)
    })

    it('puts the two rooms in different socket rooms, so nothing is merely hidden', () => {
        expect(chatSocketRoom('main', 'staff')).toBe('staff-main')
        expect(chatSocketRoom('main', 'room')).toBe('space-main')
        expect(chatSocketRoom('main', 'staff')).not.toBe(chatSocketRoom('main', 'room'))
    })

    // The trap this guards: a space literally named `staff-main` must not land
    // in another space's staff room.
    it('cannot be reached by naming a space after the staff room', () => {
        expect(chatSocketRoom('staff-main', 'room')).toBe('space-staff-main')
        expect(chatSocketRoom('staff-main', 'room')).not.toBe(chatSocketRoom('main', 'staff'))
    })
})
