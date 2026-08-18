/**
 * The audit's one job is refusing to claim what it cannot prove. The sync UI
 * this replaces said "in sync" whenever two object COUNTS matched — two
 * unrelated 3-object scenes read as identical, which is how a pull could bury
 * real work while reporting success. Every case here pins a refusal or a
 * provable relation; none of them require a server.
 */
import { describe, expect, it } from 'vitest'
import { buildSyncAudit, RELATIONS } from './sync-plan.mjs'

const side = (over = {}) => ({
    reachable: true,
    exists: true,
    verbatim: true,
    version: 10,
    objectCount: 3,
    assetIds: ['a1', 'a2'],
    missingAssetIds: [],
    projectIds: ['p1'],
    opsFloor: 1,
    opsLatest: 10,
    ...over
})

const ledger = (over = {}) => ({
    installId: 'i-1',
    cursors: { localVersion: 10, remoteVersion: 10 },
    assetIdRemap: {},
    ...over
})

describe('buildSyncAudit', () => {
    it('unlinked: relation unknown, both directions refused', () => {
        const audit = buildSyncAudit({ local: side(), remote: side(), ledger: null })
        expect(audit.relation).toBe(RELATIONS.UNKNOWN)
        expect(audit.push.allowed).toBe(false)
        expect(audit.pull.allowed).toBe(false)
        expect(audit.refusals.map((r) => r.code)).toContain('unlinked')
    })

    it('linked but never synced: null cursors keep the relation unknown and refuse both directions', () => {
        const audit = buildSyncAudit({ local: side(), remote: side(), ledger: ledger({ cursors: null }) })
        expect(audit.relation).toBe(RELATIONS.UNKNOWN)
        expect(audit.push.allowed).toBe(false)
        expect(audit.pull.allowed).toBe(false)
        expect(audit.push.reasons[0]).toMatch(/never synced/)
    })

    // An older server ignores ?verbatim=1 and answers with its filtered,
    // URL-rewritten rendering — identical apart from missingAssetIds. Copying
    // that back is the manifest-erasure bug, so verbatim:false is a hard stop.
    it('a side without verbatim reads is a refusal even when everything else lines up', () => {
        const audit = buildSyncAudit({ local: side(), remote: side({ verbatim: false }), ledger: ledger() })
        expect(audit.refusals.map((r) => r.code)).toContain('remote-no-verbatim')
        expect(audit.push.allowed).toBe(false)
        expect(audit.pull.allowed).toBe(false)
    })

    it('unreachable, missing, and denied sides are named, not conflated', () => {
        const down = buildSyncAudit({ local: side(), remote: { reachable: false }, ledger: ledger() })
        expect(down.refusals.map((r) => r.code)).toContain('remote-down')
        const gone = buildSyncAudit({ local: side(), remote: side({ exists: false }), ledger: ledger() })
        expect(gone.refusals.map((r) => r.code)).toContain('remote-missing')
        // a revoked key answers 401 with verbatim necessarily unknown — that must
        // read as "key refused", never as "server too old"
        const denied = buildSyncAudit({ local: side(), remote: side({ denied: true, verbatim: false }), ledger: ledger() })
        expect(denied.refusals.map((r) => r.code)).toContain('remote-denied')
        expect(denied.refusals.map((r) => r.code)).not.toContain('remote-no-verbatim')
    })

    it('neither side moved since the cursors: in sync, nothing to carry either way', () => {
        const audit = buildSyncAudit({ local: side(), remote: side(), ledger: ledger() })
        expect(audit.relation).toBe(RELATIONS.IN_SYNC)
        expect(audit.push.allowed).toBe(false)
        expect(audit.push.reasons[0]).toMatch(/nothing to push/)
        expect(audit.pull.reasons[0]).toMatch(/nothing to pull/)
    })

    it('only local moved: local-ahead, push possible, pull refused', () => {
        const audit = buildSyncAudit({ local: side({ version: 14 }), remote: side(), ledger: ledger() })
        expect(audit.relation).toBe(RELATIONS.LOCAL_AHEAD)
        expect(audit.push.allowed).toBe(true)
        expect(audit.pull.allowed).toBe(false)
    })

    it('only remote moved: remote-ahead, pull possible, push refused', () => {
        const audit = buildSyncAudit({ local: side(), remote: side({ version: 14 }), ledger: ledger() })
        expect(audit.relation).toBe(RELATIONS.REMOTE_AHEAD)
        expect(audit.pull.allowed).toBe(true)
        expect(audit.push.allowed).toBe(false)
    })

    // Scene ops have no inverse, so there is no three-way merge and no honest
    // way to fake one — divergence must refuse both directions outright.
    it('both moved: diverged, both directions refused with the same reason', () => {
        const audit = buildSyncAudit({ local: side({ version: 14 }), remote: side({ version: 15 }), ledger: ledger() })
        expect(audit.relation).toBe(RELATIONS.DIVERGED)
        expect(audit.push.allowed).toBe(false)
        expect(audit.pull.allowed).toBe(false)
        expect(audit.push.reasons[0]).toMatch(/diverged|both sides changed/)
    })

    // MAX_OP_HISTORY=500 / 30 days: a laptop back from a season away has ops
    // that no longer reach the cursor. That gap can only move as a bundle, and
    // the audit must say so up front rather than let a push discover it.
    it('the retention wall: an op window that no longer reaches the cursor blocks that direction', () => {
        const audit = buildSyncAudit({
            local: side({ version: 600, opsFloor: 550 }),
            remote: side(),
            ledger: ledger({ cursors: { localVersion: 10, remoteVersion: 10 } })
        })
        expect(audit.relation).toBe(RELATIONS.LOCAL_AHEAD)
        expect(audit.push.allowed).toBe(false)
        expect(audit.push.reasons[0]).toMatch(/retention wall/)
    })

    // EXIF scrubbing re-encodes bytes, so one photo hashes differently per
    // install. Without the remap the same image reads as "only here" AND
    // "only online" forever, and a future push re-uploads it every time.
    it('asset diff honours the ledger remap instead of double-counting re-encoded images', () => {
        const audit = buildSyncAudit({
            local: side({ assetIds: ['local-hash', 'shared'] }),
            remote: side({ assetIds: ['remote-hash', 'shared'] }),
            ledger: ledger({ assetIdRemap: { 'local-hash': 'remote-hash' } })
        })
        expect(audit.assets.onlyLocal).toEqual([])
        expect(audit.assets.onlyRemote).toEqual([])
        expect(audit.assets.common.sort()).toEqual(['remote-hash', 'shared'])
    })

    it('project diff is by id, both directions', () => {
        const audit = buildSyncAudit({
            local: side({ projectIds: ['p1', 'p2'] }),
            remote: side({ projectIds: ['p1', 'p3'] }),
            ledger: ledger()
        })
        expect(audit.projects.common).toEqual(['p1'])
        expect(audit.projects.onlyLocal).toEqual(['p2'])
        expect(audit.projects.onlyRemote).toEqual(['p3'])
    })
})
