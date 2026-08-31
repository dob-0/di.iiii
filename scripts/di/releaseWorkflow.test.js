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

    it('names the artifact from the tag or the caller, never package.json', () => {
        // The installer resolves a version from the release feed and then asks for
        // di-runtime-<that>.tar.gz. If the name came from package.json the two
        // could disagree, which is a 404 for everyone who pastes the line —
        // package.json has read 0.2.0 since v0.2.0.
        //
        // Two callers now: a human pushing a tag (GITHUB_REF_NAME) and
        // tag-on-promotion.yml calling this workflow with the version it just
        // tagged (inputs.version). Neither is package.json.
        expect(workflow).toContain('DI_RELEASE_VERSION: ${{ inputs.version ||')
        expect(workflow).toContain('VERSION="${DI_RELEASE_VERSION:-${GITHUB_REF_NAME#v}}"')
        expect(workflow).toContain('npm run di:pack -- --version="$VERSION"')
    })

    it('can be called as well as triggered, because a bot-pushed tag triggers nothing', () => {
        // A tag pushed with GITHUB_TOKEN does not fire `on: push: tags`. Without
        // workflow_call, every automatic tag would exist with no artifact behind
        // it — a version the installer can see and cannot install.
        expect(workflow).toContain('workflow_call:')
        expect(workflow).toContain('version:')
    })

    it('releases against the tag it was called for, not the branch it ran on', () => {
        // On a workflow_call the ref is a branch, and the release action would
        // otherwise try to publish from it.
        expect(workflow).toContain("tag_name: ${{ inputs.version && format('v{0}', inputs.version) || github.ref_name }}")
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

// Every dev → main promotion becomes a version an installed di.iiii can update
// to (decided 2026-08-19). The workflow that does it has three properties that
// are easy to lose in an edit and expensive to lose in practice.
describe('the promotion tagger', () => {
    const tagger = fs.readFileSync(path.join(repoRoot, '.github', 'workflows', 'tag-on-promotion.yml'), 'utf8')

    it('waits for the production deploy to succeed', () => {
        // A tag is a promise that this code runs. Tagging alongside the deploy
        // would make that promise before it is known.
        expect(tagger).toContain("workflows: ['Deploy VPS (GHCR + SSH)']")
        expect(tagger).toContain("github.event.workflow_run.conclusion == 'success'")
    })

    it('tags the commit that deployed, not whatever main points at by then', () => {
        expect(tagger).toContain('ref: ${{ github.event.workflow_run.head_sha || github.sha }}')
    })

    it('leaves a commit alone when a human already tagged it', () => {
        // A hand-picked minor or major must not get an automatic patch beside it.
        expect(tagger).toContain('git tag --points-at HEAD')
        expect(tagger).toContain('tagged=false')
    })

    it('calls the release workflow instead of hoping the tag triggers it', () => {
        expect(tagger).toContain('uses: ./.github/workflows/release.yml')
    })
})
