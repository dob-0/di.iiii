// @vitest-environment node

import { describe, expect, it, vi } from 'vitest'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { registerChatRoutes } = require('./chatRoutes.js')

const makeRouter = () => {
    const routes = {}
    const record = (method) => (path, ...handlers) => { routes[`${method} ${path}`] = handlers.at(-1) }
    return { routes, get: record('get'), post: record('post'), delete: record('delete'), use: () => {} }
}

const makeRes = () => ({
    statusCode: 200, body: null,
    status(code) { this.statusCode = code; return this },
    json(payload) { this.body = payload; return this }
})

const SPACES = [
    { id: 'main', label: 'The studio', kind: 'normal' },
    { id: 'dilijan', label: 'Dilijan', kind: 'normal' },
    { id: 'elsewhere', label: 'Elsewhere', kind: 'normal' },
    { id: 'sandbox-abc', label: 'A scratch pad', kind: 'sandbox' }
]

const LINES = {
    main: [{ text: 'the door code is 4417', userName: 'Gevorg', timestamp: 3000 }],
    dilijan: [{ text: 'x'.repeat(400), userName: 'Emilya', timestamp: 9000 }],
    'main#staff': [{ text: 'do not put the code in the open room', userName: 'Gevorg', timestamp: 5000 }]
}

const setup = () => {
    const router = makeRouter()
    registerChatRoutes(router, {
        deps: {
            listSpaces: async () => SPACES,
            store: { listRecent: vi.fn((id) => LINES[id] || []) }
        }
    })
    return router
}

const call = async (handler, authState = null) => {
    const res = makeRes()
    await handler({ authState }, res, (e) => { throw e })
    return res
}

const account = (spaces, extra = {}) => ({
    authenticated: true, type: 'session', subject: 'u1', role: 'editor', spaces, ...extra
})

describe('the list the app opens on', () => {
    it('refuses a visitor who is not signed in', async () => {
        const res = await call(setup().routes['get /api/chat/rooms'], null)
        expect(res.statusCode).toBe(401)
    })

    it('lists only the rooms this account can walk into', async () => {
        const res = await call(setup().routes['get /api/chat/rooms'], account(['main', 'dilijan']))
        expect(res.statusCode).toBe(200)
        expect(res.body.rooms.map((room) => room.spaceId).sort()).toEqual(['dilijan', 'main'])
    })

    // A sandbox is one person's scratch space. Listing every one of them buries
    // the rooms that matter under a pile of empty ones.
    it('never lists a sandbox, even one this account reaches', async () => {
        const res = await call(setup().routes['get /api/chat/rooms'], account([], { isUnrestricted: true }))
        expect(res.body.rooms.some((room) => room.spaceId.startsWith('sandbox'))).toBe(false)
    })

    it('carries one line of preview, cut to a preview', async () => {
        const res = await call(setup().routes['get /api/chat/rooms'], account(['dilijan']))
        const [room] = res.body.rooms
        expect(room.lastBy).toBe('Emilya')
        expect(room.lastText.length).toBe(140)
    })

    it('says plainly when a room has never been spoken in', async () => {
        const res = await call(setup().routes['get /api/chat/rooms'], account([], { isUnrestricted: true }))
        const quiet = res.body.rooms.find((room) => room.spaceId === 'elsewhere')
        expect(quiet.lastText).toBeNull()
        expect(quiet.lastAt).toBeNull()
    })

    // A list ordered by name puts the room somebody just wrote in below a room
    // nobody has ever used.
    it('puts the room last spoken in at the top, and the silent ones underneath', async () => {
        const res = await call(setup().routes['get /api/chat/rooms'], account([], { isUnrestricted: true }))
        expect(res.body.rooms.map((room) => room.spaceId)).toEqual(['dilijan', 'main', 'elsewhere'])
    })

    it('survives a room whose history cannot be read', async () => {
        const router = makeRouter()
        registerChatRoutes(router, {
            deps: {
                listSpaces: async () => [{ id: 'main', label: 'The studio', kind: 'normal' }],
                store: { listRecent: () => { throw new Error('disk gone') } }
            }
        })
        const res = await call(router.routes['get /api/chat/rooms'], account(['main']))
        expect(res.statusCode).toBe(200)
        expect(res.body.rooms[0].lastText).toBeNull()
    })

    it('will not register without a way to list spaces', () => {
        expect(() => registerChatRoutes(makeRouter(), {})).toThrow(/listSpaces/)
    })
})


describe('the staff room in the list', () => {
    it('is not listed for somebody who could not open it', async () => {
        const res = await call(setup().routes['get /api/chat/rooms'], account(['main']))
        expect(res.body.rooms.every((room) => room.channel === 'room')).toBe(true)
    })

    it('is listed beside each room for an admin, with its own last line', async () => {
        const res = await call(setup().routes['get /api/chat/rooms'], account(['main'], { role: 'admin' }))
        const staff = res.body.rooms.find((room) => room.channel === 'staff' && room.spaceId === 'main')
        expect(staff).toBeTruthy()
        expect(staff.lastText).toBe('do not put the code in the open room')
        // …and it is a DIFFERENT room, not the same lines under another name.
        const open = res.body.rooms.find((room) => room.channel === 'room' && room.spaceId === 'main')
        expect(open.lastText).toBe('the door code is 4417')
    })
})
