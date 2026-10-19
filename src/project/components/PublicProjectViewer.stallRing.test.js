import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// 2026-10-20 (PR #990 browser run): with 6 tabs over http the starved tab got its document, then hung on the lazy
// scene chunk — and that Suspense fallback was the plain ring, so "too many tabs" never showed. Every live wait in
// the viewer must go through LiveStallRing, which asks the other tabs after the stall.
const source = readFileSync(new URL('./PublicProjectViewer.jsx', import.meta.url), 'utf8')

describe('PublicProjectViewer live waits', () => {
    it('never uses the plain loading ring as a fallback or overlay directly', () => {
        expect(source).not.toMatch(/fallback=\{loadingOverlay\}/)
        expect(source).not.toMatch(/\?\s*loadingOverlay\s*:\s*null/)
    })

    it('draws LiveStallRing for both the scene code and the document/stream wait', () => {
        expect(source).toMatch(/<Suspense fallback=\{<LiveStallRing \/>\}>\s*<PublicProjectSceneSurface/)
        expect(source).toMatch(/<LiveStallRing waiting=\{!streamOpen\} \/>/)
    })
})
