// @vitest-environment node

import { createRequire } from 'node:module'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const { upsertUser, findUserById, listUsers, setUserSpaces, setUserUnrestricted } = require('./userStore.js')
const { initDb, closeDb } = require('./db.js')

beforeEach(() => {
    initDb(':memory:')
})

afterEach(() => {
    closeDb()
})

describe('userStore', () => {
    it('defaults a brand-new user to no space access', () => {
        const user = upsertUser({ provider: 'github', providerId: '1', email: 'a@example.com', displayName: 'A' })
        expect(user.spaces).toEqual([])
        expect(user.role).toBe('editor')

        const found = findUserById(user.id)
        expect(found.spaces).toEqual([])
    })

    it('does not clobber spaces on repeat login', () => {
        const first = upsertUser({ provider: 'github', providerId: '2', email: 'b@example.com', displayName: 'B' })
        setUserSpaces(first.id, ['wcc'])

        const second = upsertUser({ provider: 'github', providerId: '2', email: 'b@example.com', displayName: 'B Updated' })
        expect(second.id).toBe(first.id)
        expect(second.spaces).toEqual(['wcc'])
        expect(second.display_name).toBe('B Updated')
    })

    it('setUserSpaces normalizes and round-trips', () => {
        const user = upsertUser({ provider: 'google', providerId: '3', email: 'c@example.com', displayName: 'C' })
        const updated = setUserSpaces(user.id, ['wcc', '', '  gallery  ', 'wcc'])
        expect(updated.spaces).toEqual(['wcc', 'gallery'])

        const found = findUserById(user.id)
        expect(found.spaces).toEqual(['wcc', 'gallery'])
    })

    it('defaults a brand-new user to restricted (not unrestricted)', () => {
        const user = upsertUser({ provider: 'github', providerId: '6', email: 'f@example.com', displayName: 'F' })
        expect(user.isUnrestricted).toBe(false)
    })

    it('setUserSpaces coerces null to deny-all (unrestricted is now an explicit flag)', () => {
        const user = upsertUser({ provider: 'github', providerId: '6b', email: 'f2@example.com', displayName: 'F2' })
        const updated = setUserSpaces(user.id, null)
        expect(updated.spaces).toEqual([])
        expect(updated.isUnrestricted).toBe(false)
    })

    it('setUserUnrestricted toggles the explicit flag without touching spaces', () => {
        const user = upsertUser({ provider: 'github', providerId: '6c', email: 'f3@example.com', displayName: 'F3' })
        setUserSpaces(user.id, ['gallery'])
        const granted = setUserUnrestricted(user.id, true)
        expect(granted.isUnrestricted).toBe(true)
        expect(granted.spaces).toEqual(['gallery'])

        const revoked = setUserUnrestricted(user.id, false)
        expect(revoked.isUnrestricted).toBe(false)
    })

    it('treats a pre-existing row with no spaces column value as deny-all, not unrestricted', () => {
        const user = upsertUser({ provider: 'github', providerId: '7', email: 'g@example.com', displayName: 'G' })
        // Simulate a row that predates the spaces column (real SQL NULL, not the JSON string "null").
        const { getDb } = require('./db.js')
        getDb().prepare('UPDATE users SET spaces = NULL WHERE id = ?').run(user.id)

        const found = findUserById(user.id)
        expect(found.spaces).toEqual([])
    })

    it('listUsers returns all users with parsed spaces', () => {
        const a = upsertUser({ provider: 'github', providerId: '4', email: 'd@example.com', displayName: 'D' })
        setUserSpaces(a.id, ['main'])
        upsertUser({ provider: 'google', providerId: '5', email: 'e@example.com', displayName: 'E' })

        const users = listUsers()
        expect(users.length).toBe(2)
        const found = users.find((u) => u.id === a.id)
        expect(found.spaces).toEqual(['main'])
    })
})
