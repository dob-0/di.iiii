import { spawn } from 'node:child_process'
import fs from 'node:fs'
import http from 'node:http'
import os from 'node:os'
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

    it('treats an empty page list as a space-only declaration, not an error', async () => {
        // v5 refused: "di-space.space.json lists no projects." That refusal is
        // why most of di.iiii's own spaces could not be declared at all — main,
        // open, azd and wcc are authored in Studio and algovrithm's scene is
        // React, so none of them has a page a manifest could push. They still
        // have a name and a public flag, and those are exactly the fields whose
        // silent per-tier drift this engine exists to catch.
        const calls = []
        const server = http.createServer((req, res) => {
            calls.push(`${req.method} ${req.url}`)
            let body = ''
            req.on('data', (c) => { body += c })
            req.on('end', () => {
                if (req.method === 'PATCH') calls.push(`body ${body}`)
                res.setHeader('Content-Type', 'application/json')
                res.end(JSON.stringify(req.method === 'GET'
                    ? { space: { id: 'probe', label: 'stale name', isPublic: true } }
                    : { ok: true }))
            })
        })
        await new Promise((r) => server.listen(0, '127.0.0.1', r))
        const url = `http://127.0.0.1:${server.address().port}`

        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'space-only-'))
        const manifest = path.join(dir, 'di-space.space.json')
        fs.writeFileSync(manifest, JSON.stringify({
            spaceId: 'probe', label: 'the declared name', isPublic: true,
            minEngine: ENGINE_VERSION, tiers: { prod: { url, tokenEnv: 'PROBE_TOKEN' } }, projects: []
        }))

        const out = await new Promise((resolve) => {
            const child = spawn(process.execPath, [ENGINE, '--space', manifest, '--all', '--tier', 'prod'],
                { cwd: dir, env: { ...process.env, PROBE_TOKEN: 'probe-token' } })
            let text = ''
            child.stdout.on('data', (c) => { text += c })
            child.stderr.on('data', (c) => { text += c })
            child.on('close', (code) => resolve({ code, text }))
        })
        server.close()

        expect(out.text).not.toMatch(/lists no projects/)
        expect(out.code).toBe(0)
        // The whole point: the declared label is PUSHED, on a space with no pages.
        expect(calls).toContain('PATCH /api/spaces/probe')
        expect(calls).toContain('body {"label":"the declared name"}')
        // …and it asked for no project anywhere.
        expect(calls.some((c) => c.includes('/projects'))).toBe(false)
    })

    it('declares every space this repo is master for, readably', () => {
        // The declarations are hand-edited JSON. A typo in one of them is
        // silent until a tier drifts and the audit cannot say what it wanted.
        const dir = path.join(ROOT_DIR, 'spaces')
        const declared = fs.readdirSync(dir, { withFileTypes: true })
            .filter((e) => e.isDirectory())
            .map((e) => path.join(dir, e.name, 'di-space.space.json'))
            .filter((p) => fs.existsSync(p))
        expect(declared.length).toBeGreaterThanOrEqual(5)
        for (const file of declared) {
            const decl = JSON.parse(fs.readFileSync(file, 'utf8'))
            expect(decl.spaceId, file).toBeTruthy()
            expect(decl.label, file).toBeTruthy()
            // Strict equality, not <=: these are di.iiii's OWN spaces, declared in the
            // same repo as the engine itself, so there's no excuse for them lagging
            // behind an ENGINE_VERSION bump the way a linked repo briefly can. Catches
            // exactly the bug the golden rule "bump the version, forget the manifests"
            // describes -- fails loudly in di.iiii's own CI, not silently in a repo
            // three hops away.
            expect(Number(decl.minEngine || 0), file).toBe(ENGINE_VERSION)
            // Both deploy tiers, or the audit compares against nothing.
            expect(Object.keys(decl.tiers || {}), file).toEqual(expect.arrayContaining(['prod', 'staging']))
            // The dev box is shown and never enforced — it holds 70 undeclared
            // projects and failing on it would make the audit useless.
            expect(decl.tiers.local?.governed, file).toBe(false)
        }
    })

    it('still translates globs the way the manifests expect', () => {
        expect(globToRe('assets/**').test('assets/a/b.png')).toBe(true)
        expect(globToRe('assets/**').test('other.png')).toBe(false)
        expect(globToRe('*.html').test('index.html')).toBe(true)
        expect(globToRe('*.html').test('nested/index.html')).toBe(false)
        expect(matchGlobs(['a.html', 'b.css'], ['*.html'])).toEqual(['a.html'])
    })
})
