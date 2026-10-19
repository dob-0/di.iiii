import { afterEach, describe, expect, it, vi } from 'vitest'
import { versionLinks, versionName, versionNumberOfSlug } from './rigVariant.js'

afterEach(() => vi.restoreAllMocks())

describe('versionNumberOfSlug', () => {
    it('reads vX-Y from the slug', () => {
        expect(versionNumberOfSlug('v2-9')).toBe('2.9')
        expect(versionNumberOfSlug('v1-1')).toBe('1.1')
        expect(versionNumberOfSlug('v10-2')).toBe('10.2')
        expect(versionNumberOfSlug('moxir-v2-9')).toBe('2.9')
    })
    it('is null without the pattern', () => {
        expect(versionNumberOfSlug('moxir-hall-known-full')).toBeNull()
        expect(versionNumberOfSlug('v2')).toBeNull()
        expect(versionNumberOfSlug('v2-9-final')).toBeNull()
        expect(versionNumberOfSlug(undefined)).toBeNull()
    })
})

describe('versionName', () => {
    it('keeps a title whose number agrees with the slug, words after it allowed', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
        expect(versionName('MOXIR v2.9 · looks', 'a', 'v2-9')).toBe('v2.9 looks')
        expect(versionName('MOXIR v10.2', 'a', 'v10-2')).toBe('v10.2')
        expect(warn).not.toHaveBeenCalled()
    })
    it('the slug wins over a stale number, and the warning names both', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
        expect(versionName('MOXIR v2.8 · rig show', 'a', 'v2-9')).toBe('v2.9 rig show')
        expect(warn).toHaveBeenCalledTimes(1)
        expect(warn.mock.calls[0][0]).toMatch(/v2\.8/)
        expect(warn.mock.calls[0][0]).toMatch(/v2\.9/)
        expect(warn.mock.calls[0][0]).toMatch(/v2-9/)
    })
    it('a bare build number after the version is the name, and agrees with the slug', () => {
        expect(versionName('MOXIR v2.0 · 2.6', 'a', 'v2-6')).toBe('v2.6')
    })
    it('a title with no number gets the slug number', () => {
        expect(versionName('looks', 'a', 'v1-1')).toBe('v1.1 looks')
    })
    it('a slug without the pattern falls back to the stored label', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
        expect(versionName('MOXIR v2.8 · x', 'a', 'moxir-hall-known')).toBe('v2.8 x')
        expect(versionName('', 'known', 'moxir-hall-known')).toBe('known')
        expect(warn).not.toHaveBeenCalled()
    })
})

describe('versionLinks names from every source', () => {
    const href = (id) => `/s/${id}`
    const variant = { set: 'moxir', id: 'rig', title: 'MOXIR v2.9 — rig show' }
    it('the production list entry for the current project: stale title, slug wins', () => {
        vi.spyOn(console, 'warn').mockImplementation(() => {})
        const list = { production: { id: 'moxir' }, entries: [
            { id: 'a', projectId: 'v2-8', title: 'MOXIR v2.8', status: 'candidate' },
            { id: 'b', projectId: 'v2-9', title: 'MOXIR v2.8 · rig show', status: 'candidate' }
        ] }
        const rows = list.entries.map((e) => ({ id: e.projectId }))
        const links = versionLinks(variant, 'v2-9', href, rows, list)
        expect(links.find((l) => l.current).name).toBe('v2.9 rig show')
        expect(links.find((l) => !l.current).name).toBe('v2.8')
    })
    it('the space rows source', () => {
        vi.spyOn(console, 'warn').mockImplementation(() => {})
        const rows = [
            { id: 'v2-8', rigVariant: { set: 'moxir', id: 'a', title: 'MOXIR v2.8' } },
            { id: 'v2-9', rigVariant: { set: 'moxir', id: 'b', title: 'MOXIR v2.8 · rig show' } }
        ]
        expect(versionLinks(variant, 'v2-9', href, rows).find((l) => l.current).name).toBe('v2.9 rig show')
    })
    it('the stored siblings source', () => {
        vi.spyOn(console, 'warn').mockImplementation(() => {})
        const v = { ...variant, siblings: [{ id: 'a', projectId: 'v2-8', title: 'MOXIR v2.8' }, { id: 'rig', projectId: 'v2-9', title: 'MOXIR v2.8' }] }
        expect(versionLinks(v, 'v2-9', href).find((l) => l.current).name).toBe('v2.9')
    })

    it('a bare stored number ("2.8", no v) is the number token: the slug wins, nothing doubled (the test copy, 2026-10-14)', () => {
        expect(versionName('2.8', 'x', 'moxir-v2-9')).toBe('v2.9')
        expect(versionName('2.8 looks', 'x', 'moxir-v2-9')).toBe('v2.9 looks')
        expect(versionName('2.9', 'x', 'moxir-v2-9')).toBe('v2.9')
        expect(versionName('v2.9 - a laser matrix', 'x', 'moxir-v2-9')).toBe('v2.9 - a laser matrix')
    })
})
