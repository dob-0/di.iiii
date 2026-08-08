/**
 * The release workflow's one job is to publish the artifact `curl … /get | sh`
 * downloads. Everything else in it is optional.
 *
 * It did not behave that way: the runtime pack sat *after* the legacy cPanel
 * bundle, and that step was never given `VITE_API_TOKEN`, so it could only ever
 * throw. Two tags died there — v0.2.1 and v0.3.0 — and each published nothing at
 * all, which reads as "tagging is broken" rather than "a legacy step is missing a
 * secret". A release is rare enough that nobody notices the ordering until the
 * day they need it, so it is asserted here instead.
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const workflow = fs.readFileSync(path.join(repoRoot, '.github', 'workflows', 'release.yml'), 'utf8')

const stepIndex = (name) => workflow.indexOf(`- name: ${name}`)

describe('the release workflow', () => {
    it('packs the di runtime before anything cPanel', () => {
        const pack = stepIndex('Pack the di runtime')
        const cpanel = stepIndex('Stage cPanel release')
        expect(pack).toBeGreaterThan(-1)
        expect(cpanel).toBeGreaterThan(-1)
        expect(pack, 'a legacy step must not be able to stop the artifact being built').toBeLessThan(cpanel)
    })

    it('names the artifact from the tag, not package.json', () => {
        // The installer resolves a version from the release feed and then asks for
        // di-runtime-<that>.tar.gz. If the name came from package.json the two
        // could disagree, which is a 404 for everyone who pastes the line.
        expect(workflow).toContain('npm run di:pack -- --version=${GITHUB_REF_NAME#v}')
    })

    it('makes every legacy cPanel step conditional', () => {
        for (const step of ['Stage cPanel release', 'Zip dist', 'Zip cPanel release']) {
            const from = stepIndex(step)
            expect(from, `${step} is missing`).toBeGreaterThan(-1)
            const body = workflow.slice(from, from + 200)
            expect(body, `${step} must not run unconditionally`).toContain("if: steps.cpanel.outputs.possible == 'true'")
        }
    })

    it('still uploads the runtime when the legacy bundles were skipped', () => {
        expect(workflow).toContain('fail_on_unmatched_files: false')
        expect(workflow).toContain('dist-runtime/di-runtime-*.tar.gz')
        expect(workflow).toContain('dist-runtime/checksums.txt')
    })
})
