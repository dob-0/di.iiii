import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const { planProjects, MAX_TRASH_PER_PASS } = require('./followProjects.js')

const SPACE = 'room'
// Ids as this server makes them (3 to 64 of a-z, 0-9, -); titles stay the short letter.
const row = (id, extra = {}) => ({ id, spaceId: SPACE, title: id.replace(/^p-/, '').toUpperCase(), slug: null, visibility: 'public', ...extra })
const plan = (o) => planProjects({ spaceId: SPACE, ...o })

describe('a project trashed on the host', () => {
    it('is trashed here when both held it and the host\'s trash lists it', () => {
        const out = plan({
            base: { 'p-a': { title: 'A', slug: null }, 'p-b': { title: 'B', slug: null } },
            here: { live: [row('p-a'), row('p-b')], trash: [] },
            there: { live: [row('p-b')], trash: [row('p-a')] }
        })
        expect(out.trashHere).toEqual(['p-a'])
        expect(out.base).toEqual({ 'p-b': { title: 'B', slug: null, visibility: 'public' } })
        expect(out.trashedBoth).toEqual(['p-a'])
        expect(out.refused).toBe(null)
    })

    it('is never trashed here from an absence — a host missing it without a trash row leaves it, departed', () => {
        const out = plan({
            base: { 'p-a': { title: 'A', slug: null }, 'p-b': { title: 'B', slug: null } },
            here: { live: [row('p-a'), row('p-b')], trash: [] },
            there: { live: [row('p-b')], trash: [] }
        })
        expect(out.trashHere).toEqual([])
        expect(out.departed).toEqual({ 'p-a': 'there' })
        expect(out.notes.join()).toMatch(/left this space on the host/)
    })

    it('is not trashed here when this follow never saw it live on both sides', () => {
        const out = plan({ here: { live: [row('p-a'), row('p-b')], trash: [] }, there: { live: [row('p-b')], trash: [row('p-a')] } })
        expect(out.trashHere).toEqual([])
    })

    it('never empties this copy: a host that trashed every project here carries none, and says so', () => {
        const out = plan({
            base: { 'p-a': { title: 'A', slug: null }, 'p-b': { title: 'B', slug: null } },
            here: { live: [row('p-a'), row('p-b')], trash: [] },
            there: { live: [], trash: [row('p-a'), row('p-b')] }
        })
        expect(out.trashHere).toEqual([])
        expect(out.refused).toMatch(/would empty this copy/)
        // Kept in the base, so the person's own trash later is understood.
        expect(Object.keys(out.base).sort()).toEqual(['p-a', 'p-b'])
        expect(out.trashedBoth).toEqual([])
    })

    it(`carries no more than ${MAX_TRASH_PER_PASS} in one pass`, () => {
        const ids = Array.from({ length: MAX_TRASH_PER_PASS + 1 }, (_, i) => `p-${i}0`)
        const base = Object.fromEntries([...ids, 'keep'].map(id => [id, { title: id.toUpperCase(), slug: null }]))
        const out = plan({
            base,
            here: { live: [...ids, 'keep'].map(id => row(id)), trash: [] },
            there: { live: [row('keep')], trash: ids.map(id => row(id)) }
        })
        expect(out.trashHere).toEqual([])
        expect(out.refused).toMatch(new RegExp(`more than ${MAX_TRASH_PER_PASS}`))
    })

    it('carries the last project of a space when it is the only one', () => {
        const out = plan({ base: { 'p-a': { title: 'A', slug: null } }, here: { live: [row('p-a')], trash: [] }, there: { live: [], trash: [row('p-a')] } })
        expect(out.trashHere).toEqual(['p-a'])
    })

    it('ignores a trash row from another space', () => {
        const out = plan({
            base: { 'p-a': { title: 'A', slug: null }, 'p-b': { title: 'B', slug: null } },
            here: { live: [row('p-a'), row('p-b')], trash: [] },
            there: { live: [row('p-b')], trash: [row('p-a', { spaceId: 'elsewhere' })] }
        })
        expect(out.trashHere).toEqual([])
    })
})

describe('a project trashed or restored on the other side', () => {
    it('restores here a project the host took out of its trash, once both trashes held it', () => {
        const out = plan({ trashedBoth: ['p-a'], here: { live: [], trash: [row('p-a')] }, there: { live: [row('p-a')], trash: [] } })
        expect(out.restoreHere).toEqual(['p-a'])
    })

    it('does not restore here a project only this install trashed — and says the host keeps it', () => {
        const out = plan({ base: { 'p-a': { title: 'A', slug: null } }, here: { live: [], trash: [row('p-a')] }, there: { live: [row('p-a')], trash: [] } })
        expect(out.restoreHere).toEqual([])
        expect(out.base).toHaveProperty('p-a')
        expect(out.notes.join()).toMatch(/cannot trash on the host/)
    })

    it('remembers a project in both trashes, and forgets it once it is gone from both', () => {
        expect(plan({ here: { live: [], trash: [row('p-a')] }, there: { live: [], trash: [row('p-a')] } }).trashedBoth).toEqual(['p-a'])
        expect(plan({ trashedBoth: ['p-a'], here: { live: [], trash: [] }, there: { live: [], trash: [] } }).trashedBoth).toEqual([])
    })
})

describe('a project renamed', () => {
    const base = { 'p-a': { title: 'Old', slug: 'old' } }
    it('takes the host\'s new title here', () => {
        const out = plan({ base, here: { live: [row('p-a', { title: 'Old', slug: 'old' })], trash: [] }, there: { live: [row('p-a', { title: 'New', slug: 'old' })], trash: [] } })
        expect(out.patchHere).toEqual([{ id: 'p-a', patch: { title: 'New' } }])
        expect(out.patchThere).toEqual([])
        expect(out.base['p-a']).toEqual({ title: 'New', slug: 'old', visibility: 'public' })
    })

    it('carries a rename made here to the host', () => {
        const out = plan({ base, here: { live: [row('p-a', { title: 'Mine', slug: 'mine' })], trash: [] }, there: { live: [row('p-a', { title: 'Old', slug: 'old' })], trash: [] } })
        expect(out.patchThere).toEqual([{ id: 'p-a', patch: { title: 'Mine', slug: 'mine' } }])
        expect(out.patchHere).toEqual([])
    })

    it('when both renamed, the host wins', () => {
        const out = plan({ base, here: { live: [row('p-a', { title: 'Mine', slug: 'old' })], trash: [] }, there: { live: [row('p-a', { title: 'Theirs', slug: 'old' })], trash: [] } })
        expect(out.patchHere).toEqual([{ id: 'p-a', patch: { title: 'Theirs' } }])
        expect(out.patchThere).toEqual([])
    })

    it('with no base yet, the host wins', () => {
        const out = plan({ here: { live: [row('p-a', { title: 'Mine' })], trash: [] }, there: { live: [row('p-a', { title: 'Theirs' })], trash: [] } })
        expect(out.patchHere).toEqual([{ id: 'p-a', patch: { title: 'Theirs' } }])
    })
})

describe('a project made private', () => {
    it('a private host makes this copy private; a public host never makes a private copy public', () => {
        const hidden = plan({ here: { live: [row('p-a')], trash: [] }, there: { live: [row('p-a', { visibility: 'private' })], trash: [] } })
        expect(hidden.patchHere).toEqual([{ id: 'p-a', patch: { visibility: 'private' } }])
        const kept = plan({ here: { live: [row('p-a', { visibility: 'private' })], trash: [] }, there: { live: [row('p-a')], trash: [] } })
        expect(kept.patchHere).toEqual([])
        expect(kept.notes.join()).toMatch(/left private/)
    })
})

describe('a project that left the space', () => {
    it('moved away here: the host still has it, departed here, said', () => {
        const out = plan({ base: { 'p-a': { title: 'A', slug: null } }, here: { live: [], trash: [] }, there: { live: [row('p-a')], trash: [] } })
        expect(out.departed).toEqual({ 'p-a': 'here' })
        expect(out.restoreHere).toEqual([])
    })

    it('stays departed while it is still on one side, and is forgotten once live on both again', () => {
        const still = plan({ departed: { 'p-a': 'there' }, here: { live: [row('p-a')], trash: [] }, there: { live: [], trash: [] } })
        expect(still.departed).toEqual({ 'p-a': 'there' })
        const back = plan({ departed: { 'p-a': 'there' }, here: { live: [row('p-a')], trash: [] }, there: { live: [row('p-a')], trash: [] } })
        expect(back.departed).toEqual({})
        expect(back.base).toHaveProperty('p-a')
    })
})

// With a key the host's owner minted as `manage` (SPEC_space_sync_keys.md §13):
// a trash, restore or making private made HERE reaches the host, under the same
// guards mirrored. With an ordinary key, every one of them stays a note.
describe('with a manage key, a change made here reaches the host', () => {
    const base = { 'p-a': { title: 'A', slug: null, visibility: 'public' }, 'p-b': { title: 'B', slug: null, visibility: 'public' }, 'p-c': { title: 'C', slug: null, visibility: 'public' } }

    it('a project trashed here is trashed on the host — and not with an edit key', () => {
        const input = { base, here: { live: [row('p-b'), row('p-c')], trash: [row('p-a')] }, there: { live: [row('p-a'), row('p-b'), row('p-c')], trash: [] } }
        const managed = plan({ ...input, manageThere: true })
        expect(managed.trashThere).toEqual(['p-a'])
        expect(managed.base['p-a']).toBeUndefined()
        expect(managed.trashedBoth).toEqual(['p-a'])
        const edit = plan(input)
        expect(edit.trashThere).toEqual([])
        expect(edit.base['p-a']).toEqual(base['p-a'])
        expect(edit.notes.join()).toMatch(/cannot trash on the host/)
    })

    it('never from an absence: a project gone here with no trash row is departed, not trashed there', () => {
        const out = plan({ base, manageThere: true, here: { live: [row('p-b'), row('p-c')], trash: [] }, there: { live: [row('p-a'), row('p-b'), row('p-c')], trash: [] } })
        expect(out.trashThere).toEqual([])
        expect(out.departed).toEqual({ 'p-a': 'here' })
    })

    it('never empties the host: trashing every project it holds here carries none, and says so', () => {
        const out = plan({ base, manageThere: true, here: { live: [], trash: [row('p-a'), row('p-b'), row('p-c')] }, there: { live: [row('p-a'), row('p-b'), row('p-c')], trash: [] } })
        expect(out.trashThere).toEqual([])
        expect(out.refusedThere).toMatch(/would empty the host/)
        expect(Object.keys(out.base).sort()).toEqual(['p-a', 'p-b', 'p-c'])
    })

    it('never more than MAX_TRASH_PER_PASS at once', () => {
        const ids = Array.from({ length: MAX_TRASH_PER_PASS + 2 }, (_, i) => `p-${i}0`)
        const many = Object.fromEntries(ids.map(id => [id, { title: id.toUpperCase(), slug: null, visibility: 'public' }]))
        const keep = ['p-k1', 'p-k2']
        for (const id of keep) many[id] = { title: id.toUpperCase(), slug: null, visibility: 'public' }
        const out = plan({ base: many, manageThere: true, here: { live: keep.map(id => row(id)), trash: ids.map(id => row(id)) }, there: { live: [...ids, ...keep].map(id => row(id)), trash: [] } })
        expect(out.trashThere).toEqual([])
        expect(out.refusedThere).toMatch(new RegExp(`more than ${MAX_TRASH_PER_PASS}`))
    })

    it('a project taken out of the trash here is restored on the host when both trashes held it', () => {
        const out = plan({ base: { 'p-b': base['p-b'], 'p-c': base['p-c'] }, trashedBoth: ['p-a'], manageThere: true, here: { live: [row('p-a'), row('p-b'), row('p-c')], trash: [] }, there: { live: [row('p-b'), row('p-c')], trash: [row('p-a')] } })
        expect(out.restoreThere).toEqual(['p-a'])
        const edit = plan({ base: { 'p-b': base['p-b'], 'p-c': base['p-c'] }, trashedBoth: ['p-a'], here: { live: [row('p-a'), row('p-b'), row('p-c')], trash: [] }, there: { live: [row('p-b'), row('p-c')], trash: [row('p-a')] } })
        expect(edit.restoreThere).toEqual([])
        expect(edit.notes.join()).toMatch(/cannot restore on the host/)
    })

    it('made private here is made private on the host when the host is as the base had it', () => {
        const out = plan({ base, manageThere: true, here: { live: [row('p-a', { visibility: 'private' }), row('p-b'), row('p-c')], trash: [] }, there: { live: [row('p-a'), row('p-b'), row('p-c')], trash: [] } })
        expect(out.patchThere).toEqual([{ id: 'p-a', patch: { visibility: 'private' } }])
        expect(out.base['p-a'].visibility).toBe('private')
        const edit = plan({ base, here: { live: [row('p-a', { visibility: 'private' }), row('p-b'), row('p-c')], trash: [] }, there: { live: [row('p-a'), row('p-b'), row('p-c')], trash: [] } })
        expect(edit.patchThere).toEqual([])
        expect(edit.base['p-a'].visibility).toBe('public')
    })

    it('never hides again a project the owner made public on the host', () => {
        const wasPrivate = { ...base, 'p-a': { title: 'A', slug: null, visibility: 'private' } }
        const out = plan({ base: wasPrivate, manageThere: true, here: { live: [row('p-a', { visibility: 'private' }), row('p-b'), row('p-c')], trash: [] }, there: { live: [row('p-a'), row('p-b'), row('p-c')], trash: [] } })
        expect(out.patchThere).toEqual([])
        expect(out.patchHere).toEqual([])
        expect(out.base['p-a'].visibility).toBe('private')
        expect(out.notes.join()).toMatch(/host made it public/)
    })

    it('carries no visibility with no agreed one (a base from before, or a first pass)', () => {
        const old = { ...base, 'p-a': { title: 'A', slug: null } }
        const out = plan({ base: old, manageThere: true, here: { live: [row('p-a', { visibility: 'private' }), row('p-b'), row('p-c')], trash: [] }, there: { live: [row('p-a'), row('p-b'), row('p-c')], trash: [] } })
        expect(out.patchThere).toEqual([])
        expect(out.base['p-a'].visibility).toBe(null)
    })

    it('never makes the host public: public here and private there makes this copy private', () => {
        const out = plan({ base, manageThere: true, here: { live: [row('p-a'), row('p-b'), row('p-c')], trash: [] }, there: { live: [row('p-a', { visibility: 'private' }), row('p-b'), row('p-c')], trash: [] } })
        expect(out.patchThere).toEqual([])
        expect(out.patchHere).toEqual([{ id: 'p-a', patch: { visibility: 'private' } }])
    })
})

// Follow audit F18: since #800 a plan sends DELETE, PATCH, restore and move to
// /api/projects/<id>; '..' survives encodeURIComponent and new URL dot-normalises
// it, so a row whose id this server would never make is no row at all.
describe('a project row whose id this server would never make', () => {
    const none = (out) => [out.trashHere, out.restoreHere, out.trashThere, out.restoreThere, out.patchHere, out.patchThere].every(list => list.length === 0)

    it('in the host\'s trash yields no action, and is counted', () => {
        const dropped = []
        const out = plan({
            base: { '..': { title: 'X', slug: null } },
            here: { live: [row('..'), row('kept-one')], trash: [] },
            there: { live: [row('kept-one')], trash: [row('..')] },
            onDrop: (reason, id) => dropped.push([reason, id])
        })
        expect(none(out)).toBe(true)
        expect(dropped).toContainEqual(['bad id', '..'])
    })

    it('live on the host yields no action', () => {
        const out = plan({
            base: {},
            here: { live: [row('..', { title: 'Here' }), row('kept-one', { title: 'Here' })], trash: [] },
            there: { live: [row('..', { title: 'Renamed', visibility: 'private' }), row('kept-one', { title: 'Here' })], trash: [] }
        })
        expect(none(out)).toBe(true)
        expect(Object.keys(out.base)).toEqual(['kept-one'])
    })
})
