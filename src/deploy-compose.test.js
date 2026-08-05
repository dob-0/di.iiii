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

    // The compose defaults (`:latest` for prod, `:staging` for staging) only
    // decide what a MANUAL `docker compose up -d` runs -- and they resolve
    // against the host's LOCAL image cache. Each host only ever pulls its
    // namespaced `prod-<sha>`/`staging-<sha>` tag, so its copy of the floating
    // tag is whatever was pulled the last time that tag was used. On
    // 2026-08-04 both hosts' `latest` was two weeks old, and a manual restart
    // silently ran that instead of the deployed build -- production included,
    // reporting a two-week-old release.json and nothing else amiss. Staging's
    // `${IMAGE_TAG:-staging}` default didn't save it either: its .env carried
    // an explicit `IMAGE_TAG=latest`, which wins over the default.
    // So the deploy must WRITE the tag it ran into the host's .env.
    it('persists the deployed image tag to the host .env', () => {
        for (const wf of [prod, staging]) {
            expect(wf).toMatch(/sed -i "s\|\^IMAGE_TAG=\.\*\|IMAGE_TAG=\$\{IMAGE_TAG\}\|" \.env/)
            expect(wf).toMatch(/echo "IMAGE_TAG=\$\{IMAGE_TAG\}" >> \.env/)
            // must happen after the containers are actually up, not before
            expect(wf.indexOf('up -d')).toBeLessThan(wf.indexOf('IMAGE_TAG=${IMAGE_TAG}" >> .env'))
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

// The GitHub App's three secrets were configured on cPanel and never carried
// into the compose file that replaced it, so from the 2026-07-15 VPS move
// `githubApp.isConfigured()` was false on both hosts: one-click repo→space sync
// reported "not configured" and every push webhook was rejected, for three
// weeks, with nothing in the logs — the feature is designed to stay quiet when
// unconfigured. Same silent-fallback class as the staging `:latest` tag above,
// applied to a feature's secrets. This derives the required names from the code
// that reads them, so a NEW env var can't be added to githubApp.js and left out
// of compose the same way.
describe('the server container receives the GitHub App secrets', () => {
    const base = read('docker-compose.yml')
    const staging = read('docker-compose.staging.yml')

    // getPrivateKey() accepts any one of these, in this order.
    const PRIVATE_KEY_VARS = [
        'GITHUB_APP_PRIVATE_KEY_PATH',
        'GITHUB_APP_PRIVATE_KEY_B64',
        'GITHUB_APP_PRIVATE_KEY'
    ]

    const envNamesReadBy = (rel) => [
        ...new Set(
            (read(rel).match(/process\.env\.GITHUB_APP_[A-Z0-9_]+/g) || [])
                .map((hit) => hit.replace('process.env.', ''))
        )
    ]

    it.each([
        ['docker-compose.yml', base, ''],
        ['docker-compose.staging.yml', staging, 'STAGING_']
    ])('%s passes the id and the webhook secret', (_name, source, prefix) => {
        for (const key of ['GITHUB_APP_ID', 'GITHUB_APP_WEBHOOK_SECRET']) {
            expect(source).toContain(`${key}: \${${prefix}${key}:-}`)
        }
    })

    it.each([
        ['docker-compose.yml', base],
        ['docker-compose.staging.yml', staging]
    ])('%s passes exactly one private-key channel', (_name, source) => {
        const passed = PRIVATE_KEY_VARS.filter((key) => source.includes(`${key}:`))
        // More than one is worse than none: getPrivateKey() prefers _PATH, so an
        // empty _PATH silently shadows a good _B64 value.
        expect(passed).toEqual(['GITHUB_APP_PRIVATE_KEY_B64'])
    })

    it('covers every GITHUB_APP_* var githubApp.js actually reads', () => {
        const uncovered = envNamesReadBy('serverXR/src/githubApp.js')
            .filter((key) => !PRIVATE_KEY_VARS.includes(key))
            .filter((key) => !base.includes(`${key}:`))
        expect(uncovered).toEqual([])
    })

    it('documents all three in .env.example, for prod and staging', () => {
        const example = read('.env.example')
        for (const key of ['GITHUB_APP_ID', 'GITHUB_APP_PRIVATE_KEY_B64', 'GITHUB_APP_WEBHOOK_SECRET']) {
            expect(example).toContain(`${key}=`)
            expect(example).toContain(`STAGING_${key}=`)
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

// Regression guard: nginx's gzip_proxied defaults to `off`, and Caddy fronts
// the client container with a `Via` header — which is exactly how nginx decides
// a request is proxied. So `gzip on` was live and every HTML/JS/CSS response
// still went out uncompressed in production (three-vendor.js: 1,614,468 B on
// the wire instead of 459,321 B). The whole gzip block is inert without this
// one directive, and nothing about the config looks wrong from the outside.
describe('nginx actually compresses through the Caddy front', () => {
    const conf = read('nginx.conf')

    it('sets gzip_proxied, without which the gzip block is dead behind a proxy', () => {
        expect(conf).toMatch(/^\s*gzip\s+on;/m)
        expect(conf).toMatch(/^\s*gzip_proxied\s+any;/m)
    })

    it('sets gzip_vary so caches key on Accept-Encoding', () => {
        expect(conf).toMatch(/^\s*gzip_vary\s+on;/m)
    })

    it('still compresses the types that dominate first paint', () => {
        for (const type of ['text/css', 'application/javascript', 'application/json']) {
            expect(conf).toContain(type)
        }
    })
})

// Regression guard: vps-restore.sh used to run
//   rm -rf <live data> && tar xzf <archive>
// in a single shell, so a truncated or corrupt archive deleted production and
// restored nothing. The archive must be checked before anything is stopped or
// moved, and the swap must preserve the previous data rather than delete it.
describe('vps-restore.sh cannot destroy live data with a bad archive', () => {
    const script = read('deploy/vps-restore.sh')

    it('verifies archive integrity and contents before the confirmation prompt', () => {
        const verifyAt = script.indexOf('gzip -t')
        const promptAt = script.indexOf("Type 'restore' to continue")
        const stopAt = script.indexOf('docker stop')
        expect(verifyAt).toBeGreaterThan(-1)
        expect(script).toContain('.backup-snapshot.db')
        expect(verifyAt).toBeLessThan(promptAt)
        expect(verifyAt).toBeLessThan(stopAt)
    })

    it('never deletes the live data — it stages the extract and moves the old aside', () => {
        expect(script).not.toMatch(/rm -rf\s+uploads/)
        expect(script).toContain('.restore-stage-')
        expect(script).toContain('.pre-restore-')
        // Extraction into staging must precede the move of anything live: the
        // move-aside loop is the first line that writes into $KEEP.
        const extractAt = script.indexOf('tar xzf')
        const moveAsideAt = script.indexOf('KEEP/')
        expect(extractAt).toBeGreaterThan(-1)
        expect(moveAsideAt).toBeGreaterThan(-1)
        expect(extractAt).toBeLessThan(moveAsideAt)
    })
})
