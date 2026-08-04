// @vitest-environment node
//
// Regression guard for audit batch 2, "silent hardcoded fallback" class applied
// to deploy config: docker-compose.staging.yml never overrode the image, so it
// inherited docker-compose.prod.yml's `${IMAGE_TAG:-latest}`. `:latest` is
// pushed only by the production workflow, and the staging workflow pins
// IMAGE_TAG inside its SSH session without ever writing it to the staging
// checkout's .env — so any manual compose op in that directory (reboot
// recovery, restart after an OOM, exactly what the file's header documents)
// ran production code at staging.di-studio.xyz while everyone believed they
// were verifying dev.

import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = (name) => readFileSync(path.join(REPO_ROOT, name), 'utf8')

const imageLines = (source) => source
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith('image:') && line.includes('dii-'))

describe('staging compose image tags', () => {
    const staging = read('docker-compose.staging.yml')

    it('overrides both service images so prod\'s :latest default is never inherited', () => {
        const images = imageLines(staging)
        expect(images).toHaveLength(2)
        expect(images.some((line) => line.includes('dii-server'))).toBe(true)
        expect(images.some((line) => line.includes('dii-client'))).toBe(true)
    })

    it('defaults every staging image to :staging, never :latest', () => {
        for (const line of imageLines(staging)) {
            expect(line).toContain('${IMAGE_TAG:-staging}')
            expect(line).not.toContain('latest')
        }
    })

    it('still pushes the :staging tag it depends on', () => {
        expect(read('.github/workflows/deploy-vps-staging.yml')).toMatch(/:staging\s*$/m)
    })

    it('leaves production on :latest', () => {
        for (const line of imageLines(read('docker-compose.prod.yml'))) {
            expect(line).toContain('${IMAGE_TAG:-latest}')
        }
    })
})

// Regression guards for audit batch 2's deploy-config findings.
describe('deploy workflow hardening', () => {
    const prod = read('.github/workflows/deploy-vps.yml')
    const staging = read('.github/workflows/deploy-vps-staging.yml')

    // Both workflows pushed dii-*:<sha>, but the images differ — DEPLOY_ENV is
    // baked into release.json, which GET /api/health self-reports. On the
    // normal dev→main promote the same sha is rebuilt and the tag overwritten,
    // so a host could run an image claiming the wrong environment.
    it('namespaces the per-commit image tag by environment', () => {
        expect(staging).toContain(':staging-${{ github.sha }}')
        expect(prod).toContain(':prod-${{ github.sha }}')
        for (const wf of [prod, staging]) {
            expect(wf).not.toMatch(/dii[^\n]*:\$\{\{ github\.sha \}\}/)
        }
    })

    // IMAGE_TAG is now the namespaced image tag, so the remote `git checkout`
    // (which needs a real commit) must use GIT_SHA instead — otherwise the
    // deploy would try to check out a ref named "prod-<sha>" and fail.
    it('checks out deploy config by commit, not by the image tag', () => {
        for (const wf of [prod, staging]) {
            expect(wf).toMatch(/GIT_SHA=/)
            expect(wf).toMatch(/git checkout --quiet "\$\{GIT_SHA\}"/)
            expect(wf).not.toMatch(/git checkout --quiet "\$\{IMAGE_TAG\}"/)
        }
    })

    // ssh-keyscan seconds before connecting made StrictHostKeyChecking=yes
    // decorative: trust-on-first-use, repeated every single deploy.
    it('prefers a pinned host key over ssh-keyscan', () => {
        for (const wf of [prod, staging]) {
            expect(wf).toContain('VPS_HOST_KEY')
            expect(wf).toMatch(/if \[ -n "\$\{VPS_HOST_KEY:-\}" \]/)
            expect(wf).toContain('StrictHostKeyChecking=yes')
        }
    })
})

// Regression guard for audit batch 2: the SSE endpoints fall into nginx's
// generic /serverXR/ block, which keeps proxy_buffering on — the same class of
// miss as the mesh websocket upgrade. Without this header nginx may hold small
// SSE writes, so collaborators' events arrive late or in bursts on the
// Docker/VPS deploy while working perfectly under the Vite dev proxy.
describe('SSE responses opt out of proxy buffering', () => {
    it.each([
        'serverXR/src/routes/projectRoutes.js',
        'serverXR/src/routes/spaceRoutes.js'
    ])('%s', (rel) => {
        const source = read(rel)
        expect(source).toContain("res.setHeader('Content-Type', 'text/event-stream')")
        expect(source).toContain("res.setHeader('X-Accel-Buffering', 'no')")
    })
})
