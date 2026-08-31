import { describe, expect, it } from 'vitest'
import {
    collectDependencyDrift,
    collectMissingSpaces,
    formatDependencyDriftWarning,
    formatFetchAgeNote,
    formatSpaceDriftWarning,
    isSandboxSpaceId,
} from './dev-stack-lib.mjs'

describe('collectDependencyDrift', () => {
    const lock = {
        'node_modules/vite': { version: '8.2.1' },
        'node_modules/globals': { version: '17.11.0' },
        'node_modules/react': { version: '18.3.1' },
        'node_modules/vite/node_modules/esbuild': { version: '0.21.0' },
        '': { name: 'root' },
    }

    it('names a package installed behind the lockfile', () => {
        // The real case: the box ran vite 8.1.5 with 8.2.1 locked, and nothing
        // anywhere compared the two. A minor version drift here is what makes
        // "it builds on my machine" untrue of CI.
        const drift = collectDependencyDrift(lock, (dir) => (
            dir === 'node_modules/vite' ? '8.1.5' : lock[dir]?.version
        ))
        expect(drift).toEqual([{ name: 'vite', locked: '8.2.1', installed: '8.1.5' }])
    })

    it('ignores a package that is not installed at all', () => {
        // That is `npm ci`'s business, not a version disagreement — reporting
        // it as drift would name every optional dependency on every boot.
        const drift = collectDependencyDrift(lock, (dir) => (dir === 'node_modules/react' ? null : lock[dir]?.version))
        expect(drift).toEqual([])
    })

    it('ignores nested copies', () => {
        // A nested resolution is not something a person acts on.
        const drift = collectDependencyDrift(lock, (dir) => (
            dir === 'node_modules/vite/node_modules/esbuild' ? '0.19.0' : lock[dir]?.version
        ))
        expect(drift).toEqual([])
    })

    it('says nothing when everything matches', () => {
        expect(collectDependencyDrift(lock, (dir) => lock[dir]?.version)).toEqual([])
        expect(formatDependencyDriftWarning([])).toEqual([])
    })

    it('names the first few and counts the rest', () => {
        const many = Array.from({ length: 6 }, (_, i) => ({ name: `p${i}`, locked: '2.0.0', installed: '1.0.0' }))
        const text = formatDependencyDriftWarning(many).join('\n')
        expect(text).toContain('6 package(s) differ')
        expect(text).toContain('p0 1.0.0→2.0.0')
        expect(text).toContain('+3 more')
        expect(text).toContain('npm ci')
    })
})

describe('formatFetchAgeNote', () => {
    const HOUR = 60 * 60 * 1000
    const now = 1_700_000_000_000

    it('says nothing when the ref was fetched recently', () => {
        expect(formatFetchAgeNote(now - HOUR, now)).toBe(null)
    })

    it('warns that the behind-count is measured against an old ref', () => {
        // The real case: a checkout sat 6 commits behind origin/dev while the
        // tree line reported it current, because the count is taken against the
        // local ref and nothing fetches. Silence read as "you are up to date".
        const note = formatFetchAgeNote(now - 9 * HOUR, now)
        expect(note).toContain('9h ago')
        expect(note).toContain('git fetch')
    })

    it('switches to days once the ref is really old', () => {
        expect(formatFetchAgeNote(now - 72 * HOUR, now)).toContain('3d ago')
    })

    it('handles a clone that has never fetched', () => {
        expect(formatFetchAgeNote(0, now)).toContain('never fetched')
    })
})

describe('formatSpaceDriftWarning', () => {
    it('says nothing when nothing is missing', () => {
        // A dev stack that cries wolf every boot gets read as decoration, and
        // then the one boot that matters is skipped with the rest.
        expect(formatSpaceDriftWarning(new Map())).toEqual([])
        expect(formatSpaceDriftWarning(null)).toEqual([])
    })

    it('names each space, its tier, and the command that fixes it', () => {
        const lines = formatSpaceDriftWarning(new Map([['dilijan', 'staging'], ['azd', 'prod']])).join('\n')
        expect(lines).toContain('2 space(s) live but not on this box')
        expect(lines).toContain('dilijan (staging)')
        expect(lines).toContain('azd (prod)')
        expect(lines).toContain('npm run local:mirror')
        // The distinction that cost a session: absent data reads as a broken
        // feature, and the reader goes looking in the code.
        expect(lines).toContain('This is data, not a bug')
    })
})

describe('collectMissingSpaces', () => {
    // The dev box sat five spaces behind the live tiers with nothing saying so.
    // Each case below is a way that silence could come back.

    it('names a staging-only space', () => {
        // `dilijan` was built on staging and never promoted. A production-only
        // comparison calls the box complete while it lacks the one space the
        // camp runs on — the miss reads as "the tool worked".
        const missing = collectMissingSpaces(
            ['main', 'wcc'],
            [
                { tier: 'prod', ids: ['main', 'wcc'] },
                { tier: 'staging', ids: ['main', 'wcc', 'dilijan'] },
            ]
        )
        expect([...missing]).toEqual([['dilijan', 'staging']])
    })

    it('attributes a space both tiers hold to production', () => {
        const missing = collectMissingSpaces(
            [],
            [
                { tier: 'prod', ids: ['wcc'] },
                { tier: 'staging', ids: ['wcc'] },
            ]
        )
        expect(missing.get('wcc')).toBe('prod')
    })

    it('treats an unreadable tier as unknown, never as empty', () => {
        // Offline is a real case on this desktop. If a failed fetch counted as
        // "that tier has no spaces", going offline would silently report the
        // box complete — the exact failure this check exists to end.
        const missing = collectMissingSpaces(
            ['main'],
            [
                { tier: 'prod', ids: null },
                { tier: 'staging', ids: ['main', 'dilijan'] },
            ]
        )
        expect([...missing]).toEqual([['dilijan', 'staging']])
    })

    it('says nothing when the box is current', () => {
        const missing = collectMissingSpaces(
            ['main', 'wcc', 'dilijan'],
            [
                { tier: 'prod', ids: ['main', 'wcc'] },
                { tier: 'staging', ids: ['dilijan'] },
            ]
        )
        expect(missing.size).toBe(0)
    })

    it('ignores sandboxes on both sides', () => {
        const missing = collectMissingSpaces(
            ['main'],
            [{ tier: 'prod', ids: ['main', 'sandbox-33d8ad04dc01459f'] }]
        )
        expect(missing.size).toBe(0)
        expect(isSandboxSpaceId('sandbox-abc')).toBe(true)
        expect(isSandboxSpaceId('main')).toBe(false)
    })
})
