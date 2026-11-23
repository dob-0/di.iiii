import { describe, expect, it } from 'vitest'
import { backVerdict, classifyChange, fingerprint, isSkipped, looksLikeBack, sameState, summarise } from './nav-audit-lib.mjs'

const base = { path: '/admin', hash: '', headings: ['Admin'], dialogs: [], selected: ['Monitor'], fullscreen: false }

describe('nav-audit skip words', () => {
    it.each(['Delete space', 'Remove', 'Publish now', 'Send', 'Apply', 'Merge', 'Reset', 'Wipe', 'Sign out', 'Log out', 'Carry to dev', 'Deploy', 'Arm', 'Fire', 'Laser output', 'DMX', 'Upload', 'Import', 'Restore', 'Stop', 'Kill', 'Shutdown'])('skips %s', (n) => {
        expect(isSkipped(n)).toBe(true)
    })
    it('lets safe names through', () => {
        for (const n of ['Monitor', 'Open', 'Map', 'Back', 'Desk', '']) expect(isSkipped(n)).toBe(false)
    })
})

describe('nav-audit fingerprint', () => {
    it('equal states match, any landmark change differs', () => {
        expect(sameState(base, { ...base })).toBe(true)
        expect(sameState(base, { ...base, hash: '#monitor-full' })).toBe(false)
        expect(sameState(base, { ...base, headings: ['Other'] })).toBe(false)
        expect(sameState(base, { ...base, dialogs: ['Inspector'] })).toBe(false)
        expect(fingerprint(null)).toBe(fingerprint({}))
    })
    it('classifies the change', () => {
        expect(classifyChange(base, { ...base })).toBe(null)
        expect(classifyChange(base, { ...base, path: '/x' })).toBe('url')
        expect(classifyChange(base, { ...base, dialogs: ['d'] })).toBe('overlay')
        expect(classifyChange(base, { ...base, fullscreen: true })).toBe('fullscreen')
        expect(classifyChange(base, { ...base, headings: ['B'] })).toBe('view')
    })
})

describe('nav-audit back verdict and names', () => {
    it('detects leaving the app and a wrong view', () => {
        expect(backVerdict(base, { ...base, url: 'http://a/admin', origin: 'http://a' }, 'http://a').ok).toBe(true)
        expect(backVerdict(base, { url: 'about:blank' }, 'http://a')).toEqual({ ok: false, why: 'left the app' })
        expect(backVerdict(base, { ...base, path: '/', url: 'http://a/', origin: 'http://a' }, 'http://a').why).toBe('Back went to a different view')
    })
    it('knows a back control by name', () => {
        for (const n of ['Back', 'Close', 'Desk', '×', 'Close inspector', 'Go back']) expect(looksLikeBack(n)).toBe(true)
        for (const n of ['Monitor', '', 'Open the backlog of everything that was ever written down here']) expect(looksLikeBack(n)).toBe(false)
    })
    it('sums per page', () => {
        const s = summarise([{ page: 'a', backOk: false, visibleBack: true, escOk: false }, { page: 'a', backOk: true, visibleBack: false, escOk: true }])
        expect(s.total).toEqual({ controls: 2, backFails: 1, noVisibleBack: 1, escFails: 1 })
        expect(s.by.a.controls).toBe(2)
    })
})
