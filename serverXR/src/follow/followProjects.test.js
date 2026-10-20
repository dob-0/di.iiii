import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const { planProjects, MAX_TRASH_PER_PASS } = require('./followProjects.js')

const SPACE = 'room'
const row = (id, extra = {}) => ({ id, spaceId: SPACE, title: id.toUpperCase(), slug: null, visibility: 'public', ...extra })
const plan = (o) => planProjects({ spaceId: SPACE, ...o })

describe('a project trashed on the host', () => {
    it('is trashed here when both held it and the host\'s trash lists it', () => {
        const out = plan({
            base: { a: { title: 'A', slug: null }, b: { title: 'B', slug: null } },
            here: { live: [row('a'), row('b')], trash: [] },
            there: { live: [row('b')], trash: [row('a')] }
        })
        expect(out.trashHere).toEqual(['a'])
        expect(out.base).toEqual({ b: { title: 'B', slug: null, visibility: 'public' } })
        expect(out.trashedBoth).toEqual(['a'])
        expect(out.refused).toBe(null)
    })

    it('is never trashed here from an absence — a host missing it without a trash row leaves it, departed', () => {
        const out = plan({
            base: { a: { title: 'A', slug: null }, b: { title: 'B', slug: null } },
            here: { live: [row('a'), row('b')], trash: [] },
            there: { live: [row('b')], trash: [] }
        })
        expect(out.trashHere).toEqual([])
        expect(out.departed).toEqual({ a: 'there' })
        expect(out.notes.join()).toMatch(/left this space on the host/)
    })

    it('is not trashed here when this follow never saw it live on both sides', () => {
        const out = plan({ here: { live: [row('a'), row('b')], trash: [] }, there: { live: [row('b')], trash: [row('a')] } })
        expect(out.trashHere).toEqual([])
    })

    it('never empties this copy: a host that trashed every project here carries none, and says so', () => {
        const out = plan({
            base: { a: { title: 'A', slug: null }, b: { title: 'B', slug: null } },
            here: { live: [row('a'), row('b')], trash: [] },
            there: { live: [], trash: [row('a'), row('b')] }
        })
        expect(out.trashHere).toEqual([])
        expect(out.refused).toMatch(/would empty this copy/)
        // Kept in the base, so the person's own trash later is understood.
        expect(Object.keys(out.base).sort()).toEqual(['a', 'b'])
        expect(out.trashedBoth).toEqual([])
    })

    it(`carries no more than ${MAX_TRASH_PER_PASS} in one pass`, () => {
        const ids = Array.from({ length: MAX_TRASH_PER_PASS + 1 }, (_, i) => `p${i}`)
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
        const out = plan({ base: { a: { title: 'A', slug: null } }, here: { live: [row('a')], trash: [] }, there: { live: [], trash: [row('a')] } })
        expect(out.trashHere).toEqual(['a'])
    })

    it('ignores a trash row from another space', () => {
        const out = plan({
            base: { a: { title: 'A', slug: null }, b: { title: 'B', slug: null } },
            here: { live: [row('a'), row('b')], trash: [] },
            there: { live: [row('b')], trash: [row('a', { spaceId: 'elsewhere' })] }
        })
        expect(out.trashHere).toEqual([])
    })
})

describe('a project trashed or restored on the other side', () => {
    it('restores here a project the host took out of its trash, once both trashes held it', () => {
        const out = plan({ trashedBoth: ['a'], here: { live: [], trash: [row('a')] }, there: { live: [row('a')], trash: [] } })
        expect(out.restoreHere).toEqual(['a'])
    })

    it('does not restore here a project only this install trashed — and says the host keeps it', () => {
        const out = plan({ base: { a: { title: 'A', slug: null } }, here: { live: [], trash: [row('a')] }, there: { live: [row('a')], trash: [] } })
        expect(out.restoreHere).toEqual([])
        expect(out.base).toHaveProperty('a')
        expect(out.notes.join()).toMatch(/cannot trash on the host/)
    })

    it('remembers a project in both trashes, and forgets it once it is gone from both', () => {
        expect(plan({ here: { live: [], trash: [row('a')] }, there: { live: [], trash: [row('a')] } }).trashedBoth).toEqual(['a'])
        expect(plan({ trashedBoth: ['a'], here: { live: [], trash: [] }, there: { live: [], trash: [] } }).trashedBoth).toEqual([])
    })
})

describe('a project renamed', () => {
    const base = { a: { title: 'Old', slug: 'old' } }
    it('takes the host\'s new title here', () => {
        const out = plan({ base, here: { live: [row('a', { title: 'Old', slug: 'old' })], trash: [] }, there: { live: [row('a', { title: 'New', slug: 'old' })], trash: [] } })
        expect(out.patchHere).toEqual([{ id: 'a', patch: { title: 'New' } }])
        expect(out.patchThere).toEqual([])
        expect(out.base.a).toEqual({ title: 'New', slug: 'old', visibility: 'public' })
    })

    it('carries a rename made here to the host', () => {
        const out = plan({ base, here: { live: [row('a', { title: 'Mine', slug: 'mine' })], trash: [] }, there: { live: [row('a', { title: 'Old', slug: 'old' })], trash: [] } })
        expect(out.patchThere).toEqual([{ id: 'a', patch: { title: 'Mine', slug: 'mine' } }])
        expect(out.patchHere).toEqual([])
    })

    it('when both renamed, the host wins', () => {
        const out = plan({ base, here: { live: [row('a', { title: 'Mine', slug: 'old' })], trash: [] }, there: { live: [row('a', { title: 'Theirs', slug: 'old' })], trash: [] } })
        expect(out.patchHere).toEqual([{ id: 'a', patch: { title: 'Theirs' } }])
        expect(out.patchThere).toEqual([])
    })

    it('with no base yet, the host wins', () => {
        const out = plan({ here: { live: [row('a', { title: 'Mine' })], trash: [] }, there: { live: [row('a', { title: 'Theirs' })], trash: [] } })
        expect(out.patchHere).toEqual([{ id: 'a', patch: { title: 'Theirs' } }])
    })
})

describe('a project made private', () => {
    it('a private host makes this copy private; a public host never makes a private copy public', () => {
        const hidden = plan({ here: { live: [row('a')], trash: [] }, there: { live: [row('a', { visibility: 'private' })], trash: [] } })
        expect(hidden.patchHere).toEqual([{ id: 'a', patch: { visibility: 'private' } }])
        const kept = plan({ here: { live: [row('a', { visibility: 'private' })], trash: [] }, there: { live: [row('a')], trash: [] } })
        expect(kept.patchHere).toEqual([])
        expect(kept.notes.join()).toMatch(/left private/)
    })
})

describe('a project that left the space', () => {
    it('moved away here: the host still has it, departed here, said', () => {
        const out = plan({ base: { a: { title: 'A', slug: null } }, here: { live: [], trash: [] }, there: { live: [row('a')], trash: [] } })
        expect(out.departed).toEqual({ a: 'here' })
        expect(out.restoreHere).toEqual([])
    })

    it('stays departed while it is still on one side, and is forgotten once live on both again', () => {
        const still = plan({ departed: { a: 'there' }, here: { live: [row('a')], trash: [] }, there: { live: [], trash: [] } })
        expect(still.departed).toEqual({ a: 'there' })
        const back = plan({ departed: { a: 'there' }, here: { live: [row('a')], trash: [] }, there: { live: [row('a')], trash: [] } })
        expect(back.departed).toEqual({})
        expect(back.base).toHaveProperty('a')
    })
})

// With a key the host's owner minted as `manage` (SPEC_space_sync_keys.md §13):
// a trash, restore or making private made HERE reaches the host, under the same
// guards mirrored. With an ordinary key, every one of them stays a note.
describe('with a manage key, a change made here reaches the host', () => {
    const base = { a: { title: 'A', slug: null, visibility: 'public' }, b: { title: 'B', slug: null, visibility: 'public' }, c: { title: 'C', slug: null, visibility: 'public' } }

    it('a project trashed here is trashed on the host — and not with an edit key', () => {
        const input = { base, here: { live: [row('b'), row('c')], trash: [row('a')] }, there: { live: [row('a'), row('b'), row('c')], trash: [] } }
        const managed = plan({ ...input, manageThere: true })
        expect(managed.trashThere).toEqual(['a'])
        expect(managed.base.a).toBeUndefined()
        expect(managed.trashedBoth).toEqual(['a'])
        const edit = plan(input)
        expect(edit.trashThere).toEqual([])
        expect(edit.base.a).toEqual(base.a)
        expect(edit.notes.join()).toMatch(/cannot trash on the host/)
    })

    it('never from an absence: a project gone here with no trash row is departed, not trashed there', () => {
        const out = plan({ base, manageThere: true, here: { live: [row('b'), row('c')], trash: [] }, there: { live: [row('a'), row('b'), row('c')], trash: [] } })
        expect(out.trashThere).toEqual([])
        expect(out.departed).toEqual({ a: 'here' })
    })

    it('never empties the host: trashing every project it holds here carries none, and says so', () => {
        const out = plan({ base, manageThere: true, here: { live: [], trash: [row('a'), row('b'), row('c')] }, there: { live: [row('a'), row('b'), row('c')], trash: [] } })
        expect(out.trashThere).toEqual([])
        expect(out.refusedThere).toMatch(/would empty the host/)
        expect(Object.keys(out.base).sort()).toEqual(['a', 'b', 'c'])
    })

    it('never more than MAX_TRASH_PER_PASS at once', () => {
        const ids = Array.from({ length: MAX_TRASH_PER_PASS + 2 }, (_, i) => `p${i}`)
        const many = Object.fromEntries(ids.map(id => [id, { title: id.toUpperCase(), slug: null, visibility: 'public' }]))
        const keep = ['k1', 'k2']
        for (const id of keep) many[id] = { title: id.toUpperCase(), slug: null, visibility: 'public' }
        const out = plan({ base: many, manageThere: true, here: { live: keep.map(id => row(id)), trash: ids.map(id => row(id)) }, there: { live: [...ids, ...keep].map(id => row(id)), trash: [] } })
        expect(out.trashThere).toEqual([])
        expect(out.refusedThere).toMatch(new RegExp(`more than ${MAX_TRASH_PER_PASS}`))
    })

    it('a project taken out of the trash here is restored on the host when both trashes held it', () => {
        const out = plan({ base: { b: base.b, c: base.c }, trashedBoth: ['a'], manageThere: true, here: { live: [row('a'), row('b'), row('c')], trash: [] }, there: { live: [row('b'), row('c')], trash: [row('a')] } })
        expect(out.restoreThere).toEqual(['a'])
        const edit = plan({ base: { b: base.b, c: base.c }, trashedBoth: ['a'], here: { live: [row('a'), row('b'), row('c')], trash: [] }, there: { live: [row('b'), row('c')], trash: [row('a')] } })
        expect(edit.restoreThere).toEqual([])
        expect(edit.notes.join()).toMatch(/cannot restore on the host/)
    })

    it('made private here is made private on the host when the host is as the base had it', () => {
        const out = plan({ base, manageThere: true, here: { live: [row('a', { visibility: 'private' }), row('b'), row('c')], trash: [] }, there: { live: [row('a'), row('b'), row('c')], trash: [] } })
        expect(out.patchThere).toEqual([{ id: 'a', patch: { visibility: 'private' } }])
        expect(out.base.a.visibility).toBe('private')
        const edit = plan({ base, here: { live: [row('a', { visibility: 'private' }), row('b'), row('c')], trash: [] }, there: { live: [row('a'), row('b'), row('c')], trash: [] } })
        expect(edit.patchThere).toEqual([])
        expect(edit.base.a.visibility).toBe('public')
    })

    it('never hides again a project the owner made public on the host', () => {
        const wasPrivate = { ...base, a: { title: 'A', slug: null, visibility: 'private' } }
        const out = plan({ base: wasPrivate, manageThere: true, here: { live: [row('a', { visibility: 'private' }), row('b'), row('c')], trash: [] }, there: { live: [row('a'), row('b'), row('c')], trash: [] } })
        expect(out.patchThere).toEqual([])
        expect(out.patchHere).toEqual([])
        expect(out.base.a.visibility).toBe('private')
        expect(out.notes.join()).toMatch(/host made it public/)
    })

    it('carries no visibility with no agreed one (a base from before, or a first pass)', () => {
        const old = { ...base, a: { title: 'A', slug: null } }
        const out = plan({ base: old, manageThere: true, here: { live: [row('a', { visibility: 'private' }), row('b'), row('c')], trash: [] }, there: { live: [row('a'), row('b'), row('c')], trash: [] } })
        expect(out.patchThere).toEqual([])
        expect(out.base.a.visibility).toBe(null)
    })

    it('never makes the host public: public here and private there makes this copy private', () => {
        const out = plan({ base, manageThere: true, here: { live: [row('a'), row('b'), row('c')], trash: [] }, there: { live: [row('a', { visibility: 'private' }), row('b'), row('c')], trash: [] } })
        expect(out.patchThere).toEqual([])
        expect(out.patchHere).toEqual([{ id: 'a', patch: { visibility: 'private' } }])
    })
})
