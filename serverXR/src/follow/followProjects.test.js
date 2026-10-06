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
        expect(out.base).toEqual({ b: { title: 'B', slug: null } })
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
        expect(out.base.a).toEqual({ title: 'New', slug: 'old' })
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
