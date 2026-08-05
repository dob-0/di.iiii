import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { ENGINE_VERSION, globToRe, matchGlobs, parseArgs, tierOf, SPACE_FIELDS, TIER_FIELDS } from './space-sync.mjs'

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const ENGINE = path.join(ROOT_DIR, 'scripts', 'space-sync.mjs')
const source = fs.readFileSync(ENGINE, 'utf8')
const bytes = fs.readFileSync(ENGINE)

describe('space-sync engine', () => {
    // Every guard below is a bug that shipped. The engine is copied into three
    // other repos, so each one shipped four times over.

    it('contains no literal NUL byte', () => {
        // Two of them sat in the glob helper as the `**` placeholder. Harmless
        // at runtime — and they made git call the file binary, so for months
        // the engine had no diff, no grep and no review. Both drifts between
        // the four copies happened behind that blindfold.
        expect(bytes.includes(0)).toBe(false)
    })

    it('names no default target, least of all production', () => {
        // `DEFAULT_LIVE_URL = 'https://di-studio.xyz/serverXR'` meant a sync
        // with no --to went to the live site. A rehearsal that forgets a flag
        // must fail, not publish.
        expect(source).not.toMatch(/DEFAULT_LIVE_URL/)
        expect(source).not.toMatch(/=\s*'https:\/\/di-studio\.xyz/)
    })

    it('enforces slug and title on every run, not only at creation', () => {
        // Both were sent in the POST that creates a project and nowhere else,
        // so a tier that got its projects any other way kept null slugs (404 at
        // its own door) and a rename in the manifest reached nothing. The PATCH
        // is what makes the repo actually master for these fields.
        expect(source).toMatch(/JSON\.stringify\(\{ slug: manifest\.slug \}\)/)
        expect(source).toMatch(/JSON\.stringify\(\{ title: wantTitle \}\)/)
    })

    it('exports a version manifests can pin against', () => {
        expect(Number.isInteger(ENGINE_VERSION)).toBe(true)
        expect(ENGINE_VERSION).toBeGreaterThanOrEqual(4)
        expect(source).toMatch(/minEngine/)
    })

    it('reconciles the space itself, not only its projects', () => {
        // v4 sent the space label in the CREATE POST and nowhere else, so
        // prod, staging and the dev box answered br_id_ge, br_id_ge and
        // "br_id_ge XR_ Notations:vi.ritual" and nothing could tell that was
        // wrong. Same shape of bug as the project slug (v3) and title (v4),
        // one level up.
        expect(SPACE_FIELDS).toContain('label')
        expect(source).toMatch(/PATCH[\s\S]{0,200}Object\.fromEntries\(drift\)/)
    })

    it('takes the space label from the space manifest, never from a page', () => {
        // `label` in a project manifest is that PROJECT's title. Using it to
        // create the space named a fresh tier's whole space after whichever
        // page happened to be synced first — "the landing — the door".
        expect(source).not.toMatch(/label: manifest\.label/)
        expect(source).toMatch(/label: spaceDecl\?\.label \|\| spaceId/)
    })

    it('declares per-tier difference instead of remembering it', () => {
        // staging keeps openInscriptions:false on purpose. Until it was
        // declared, that intent lived only in a prose doc — so it could not be
        // checked, and every other difference looked equally intentional.
        expect(TIER_FIELDS).toContain('openInscriptions')
    })

    it('has an audit mode that reads and never writes', () => {
        // The point of the mode: drift was only ever found by a human with
        // three browser windows open. Any write in here would make the one
        // command that is safe against prod unsafe.
        expect(parseArgs(['--audit']).audit).toBe(true)
        const auditBody = source.slice(source.indexOf('async function audit('), source.indexOf('async function main('))
        expect(auditBody.length).toBeGreaterThan(500)
        expect(auditBody).not.toMatch(/method: 'P(UT|ATCH|OST)'/)
        expect(auditBody).not.toMatch(/method: 'DELETE'/)
    })

    it('never deletes a project the manifest does not list', () => {
        // Extras are reported so they can be seen. Removing one is the only
        // operation here that can destroy work with no other copy, so it stays
        // something a person does deliberately — it is not part of a sync.
        expect(source).not.toMatch(/method: 'DELETE'/)
    })

    it('maps a tier name to its url so nobody pastes one from memory', () => {
        const tiers = {
            prod: { url: 'https://di-studio.xyz/serverXR' },
            staging: { url: 'https://staging.di-studio.xyz/serverXR' },
        }
        expect(tierOf('https://staging.di-studio.xyz/serverXR', tiers)).toBe('staging')
        expect(tierOf('https://di-studio.xyz/serverXR', tiers)).toBe('prod')
        // an unknown host must NOT silently answer "prod"
        expect(tierOf('http://localhost:4000/serverXR', tiers)).toBe('localhost:4000')
        expect(parseArgs(['--all']).all).toBe(true)
    })

    it('still translates globs the way the manifests expect', () => {
        expect(globToRe('assets/**').test('assets/a/b.png')).toBe(true)
        expect(globToRe('assets/**').test('other.png')).toBe(false)
        expect(globToRe('*.html').test('index.html')).toBe(true)
        expect(globToRe('*.html').test('nested/index.html')).toBe(false)
        expect(matchGlobs(['a.html', 'b.css'], ['*.html'])).toEqual(['a.html'])
    })
})
