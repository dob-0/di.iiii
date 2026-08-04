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
