import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { NO_DESK_SENTENCE, rigToolAccess } from './rigToolAccess.js'

const ROOT = process.cwd().endsWith('/src') ? path.resolve(process.cwd(), '..') : process.cwd()
const hosted = { requireAuth: true }

describe('who may change the rig on this page', () => {
    it('a member in scope, an admin, and a local install edit', () => {
        expect(rigToolAccess({ session: { ...hosted, authenticated: true }, inScope: true, isPublic: true })).toBe('edit')
        expect(rigToolAccess({ session: { ...hosted, authenticated: true, role: 'admin' }, isPublic: false })).toBe('edit')
        expect(rigToolAccess({ session: { requireAuth: false } })).toBe('edit')
        expect(rigToolAccess({ session: { ...hosted, local: true } })).toBe('edit')
        expect(rigToolAccess({ hasServerApi: false })).toBe('edit')
    })

    it('anyone else reads a public space and meets the gate on a private one', () => {
        expect(rigToolAccess({ session: hosted, isPublic: true })).toBe('view')
        expect(rigToolAccess({ session: { ...hosted, authenticated: true }, inScope: false, isPublic: true })).toBe('view')
        expect(rigToolAccess({ session: hosted, isPublic: false })).toBe('gate')
    })

    it('waits while either answer is still coming', () => {
        expect(rigToolAccess({ session: hosted, sessionLoading: true })).toBe('loading')
        expect(rigToolAccess({ session: hosted, publicLoading: true })).toBe('loading')
    })
})

// On a hosted tier every desk-dependent line is a sentence: never an error word, never a
// bare "none here" / "no desk here" fragment standing in for one.
describe('what the rig tools say where there is no desk', () => {
    it('is one sentence', () => {
        expect(NO_DESK_SENTENCE).toMatch(/^[A-Z].*\.$/)
        expect(NO_DESK_SENTENCE).not.toMatch(/error|fail/i)
    })

    it('no rig view prints a bare no-desk fragment', () => {
        for (const f of ['PlotSurface.jsx', 'PlotPrint.jsx', 'BuildSurface.jsx', 'CardsSurface.jsx', 'deskState.js']) {
            const src = fs.readFileSync(path.join(ROOT, 'src/rigbuild', f), 'utf8')
            expect(src, f).not.toMatch(/'none here'|'no desk here'/)
        }
    })
})
