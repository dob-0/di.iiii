import { describe, expect, it, vi } from 'vitest'
import { defaultZenFor, isPaletteSummons, readZenPreference, resolveZenPreference, writeZenPreference } from './zenMode.js'

const fakeStorage = (initial = {}) => {
    const map = new Map(Object.entries(initial))
    return {
        getItem: (k) => (map.has(k) ? map.get(k) : null),
        setItem: (k, v) => map.set(k, v),
        _map: map
    }
}

describe('defaultZenFor', () => {
    it('is on for an empty workspace', () => {
        expect(defaultZenFor({ nodeCount: 0 })).toBe(true)
    })

    it('is OFF for a workspace that already has work in it', () => {
        // Turning the chrome off under an arrangement somebody already built is
        // not a default — it is a change to their workspace.
        expect(defaultZenFor({ nodeCount: 1 })).toBe(false)
        expect(defaultZenFor({ nodeCount: 12 })).toBe(false)
    })
})

describe('readZenPreference', () => {
    it('honours a stored choice over the default, in both directions', () => {
        const withWork = { nodeCount: 9 }
        expect(readZenPreference('w1', { ...withWork, storage: fakeStorage({ 'dii.raw.zen.w1': 'on' }) })).toBe(true)
        expect(readZenPreference('w1', { nodeCount: 0, storage: fakeStorage({ 'dii.raw.zen.w1': 'off' }) })).toBe(false)
    })

    it('keeps workspaces separate', () => {
        const storage = fakeStorage({ 'dii.raw.zen.a': 'on', 'dii.raw.zen.b': 'off' })
        expect(readZenPreference('a', { nodeCount: 5, storage })).toBe(true)
        expect(readZenPreference('b', { nodeCount: 0, storage })).toBe(false)
    })

    it('falls back to the default when storage throws, rather than blowing up', () => {
        // Private-mode browsers throw on access instead of returning null.
        const hostile = { getItem: () => { throw new Error('denied') } }
        expect(readZenPreference('w', { nodeCount: 0, storage: hostile })).toBe(true)
        expect(readZenPreference('w', { nodeCount: 3, storage: hostile })).toBe(false)
    })

    it('lets a seeding caller override the default, but never a stored choice', () => {
        // A seeded starter workspace has nodes it did not earn — still zen.
        expect(readZenPreference('w', { nodeCount: 5, defaultZen: true, storage: fakeStorage() })).toBe(true)
        expect(readZenPreference('w', {
            nodeCount: 5,
            defaultZen: true,
            storage: fakeStorage({ 'dii.raw.zen.w': 'off' })
        })).toBe(false)
    })
})

describe('writeZenPreference', () => {
    it('records the choice', () => {
        const storage = fakeStorage()
        writeZenPreference('w1', true, { storage })
        expect(storage._map.get('dii.raw.zen.w1')).toBe('on')
        writeZenPreference('w1', false, { storage })
        expect(storage._map.get('dii.raw.zen.w1')).toBe('off')
    })

    it('does not throw when storage refuses', () => {
        const hostile = { setItem: () => { throw new Error('quota') } }
        expect(() => writeZenPreference('w', true, { storage: hostile })).not.toThrow()
    })
})

describe('resolveZenPreference', () => {
    it('remembers the default it just resolved, so it cannot change itself later', () => {
        // The bug this prevents: an empty workspace opens zen; you add a node;
        // next visit the default re-derives to "not new" and the chrome comes
        // back on its own.
        const storage = fakeStorage()
        expect(resolveZenPreference('w', { nodeCount: 0, storage })).toBe(true)
        expect(storage._map.get('dii.raw.zen.w')).toBe('on')
        // Same workspace, now with work in it — the stored choice still wins.
        expect(resolveZenPreference('w', { nodeCount: 7, storage })).toBe(true)
    })

    it('leaves a workspace that already had work with its chrome, and remembers that too', () => {
        const storage = fakeStorage()
        expect(resolveZenPreference('w2', { nodeCount: 4, storage })).toBe(false)
        expect(storage._map.get('dii.raw.zen.w2')).toBe('off')
    })

    it('never overrides an explicit choice', () => {
        const storage = fakeStorage({ 'dii.raw.zen.w3': 'on' })
        expect(resolveZenPreference('w3', { nodeCount: 20, storage })).toBe(true)
    })
})

describe('isPaletteSummons', () => {
    const ev = (over = {}) => ({ key: '/', target: { tagName: 'DIV' }, ...over })

    it('opens on a bare slash', () => {
        expect(isPaletteSummons(ev())).toBe(true)
    })

    it('opens on cmd/ctrl+K', () => {
        expect(isPaletteSummons(ev({ key: 'k', metaKey: true }))).toBe(true)
        expect(isPaletteSummons(ev({ key: 'k', ctrlKey: true }))).toBe(true)
        expect(isPaletteSummons(ev({ key: 'k' }))).toBe(false)
    })

    it('does NOT steal a slash typed into a field', () => {
        // The keeper's prompt box and every other text field in the workspace
        // would otherwise be unable to accept the character.
        for (const tagName of ['INPUT', 'TEXTAREA', 'SELECT']) {
            expect(isPaletteSummons(ev({ target: { tagName } }))).toBe(false)
        }
        expect(isPaletteSummons(ev({ target: { tagName: 'DIV', isContentEditable: true } }))).toBe(false)
    })

    it('still opens on cmd+K from inside a field — that one is unambiguous', () => {
        expect(isPaletteSummons(ev({ key: 'k', metaKey: true, target: { tagName: 'INPUT' } }))).toBe(true)
    })

    it('ignores a modified slash, which belongs to the browser', () => {
        expect(isPaletteSummons(ev({ metaKey: true }))).toBe(false)
        expect(isPaletteSummons(ev({ altKey: true }))).toBe(false)
    })

    it('ignores nothing', () => {
        expect(isPaletteSummons(null)).toBe(false)
    })
})
