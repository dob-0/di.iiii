// @vitest-environment node

import { mkdtemp, rm } from 'node:fs/promises'
import { createRequire } from 'node:module'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const { createSpaceStore } = require('./spaceStore.js')
const { initDb, closeDb } = require('./db.js')
const { mintInvite, resolveInvite, markInviteUsed, listInvites, revokeInvite, DEFAULT_TTL_MS } = require('./inviteStore.js')

const tempDirs = []
const makeSpace = async (id) => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'dii-invite-'))
    tempDirs.push(dir)
    const store = createSpaceStore({ spacesDir: dir, blankScene: { objects: [] } })
    await store.saveSpaceMeta(id, store.buildMeta(id, { ownerUserId: 'owner-1' }))
}

beforeEach(() => { initDb(':memory:') })
afterEach(async () => {
    closeDb()
    await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

describe('inviteStore', () => {
    it('mints a one-time-shown token that resolves to its space', async () => {
        await makeSpace('room')
        const { token, invite } = mintInvite({ spaceId: 'room', createdByUserId: 'owner-1', label: 'crew' })
        expect(token.startsWith('dii_invite_')).toBe(true)
        expect(invite).toMatchObject({ spaceId: 'room', label: 'crew', revoked: false, useCount: 0 })
        expect(invite.expiresAt - invite.createdAt).toBe(DEFAULT_TTL_MS)

        expect(resolveInvite(token)).toMatchObject({ spaceId: 'room', inviteId: invite.id })
    })

    it('fails closed on tampered, revoked, and expired tokens', async () => {
        await makeSpace('room')
        const { token, invite } = mintInvite({ spaceId: 'room' })

        expect(resolveInvite('')).toBeNull()
        expect(resolveInvite('dii_sync_notaninvite.x')).toBeNull()
        expect(resolveInvite(`dii_invite_${invite.id}.wrong-secret`)).toBeNull()
        expect(resolveInvite(`${token}x`)).toBeNull()

        expect(revokeInvite('other-space', invite.id)).toBe(false)
        expect(revokeInvite('room', invite.id)).toBe(true)
        expect(resolveInvite(token)).toBeNull()

        const expired = mintInvite({ spaceId: 'room', ttlMs: -1 })
        expect(resolveInvite(expired.token)).toBeNull()
    })

    it('tracks usage and lists only live invites', async () => {
        await makeSpace('room')
        const a = mintInvite({ spaceId: 'room', label: 'a' })
        const b = mintInvite({ spaceId: 'room', label: 'b' })

        markInviteUsed(a.invite.id)
        markInviteUsed(a.invite.id)
        revokeInvite('room', b.invite.id)

        const invites = listInvites('room')
        expect(invites).toHaveLength(1)
        expect(invites[0]).toMatchObject({ id: a.invite.id, useCount: 2 })
        expect(invites[0].lastUsedAt).toBeTruthy()
    })
})
