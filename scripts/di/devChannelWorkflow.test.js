// The CI half of the dev channel, asserted from the workflow text.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const text = fs.readFileSync(path.join(root, '.github', 'workflows', 'deploy-vps-dev.yml'), 'utf8')
const job = text.slice(text.indexOf('  publish-dev-channel:'), text.indexOf('  build-and-push:'))

describe('the publish-dev-channel job', () => {
    it('exists, runs only for dev, and only after the tests pass', () => {
        expect(job.length).toBeGreaterThan(100)
        expect(job).toContain('needs: test')
        expect(job).toContain("github.ref == 'refs/heads/dev'")
    })
    it('packs 0.x.y-dev.<sha8> and publishes a dev-<sha8> prerelease that is never latest', () => {
        expect(job).toContain('VERSION="${BASE}-dev.${SHA8}"')
        expect(job).toContain('TAG="dev-${SHA8}"')
        expect(job).toContain('--prerelease --latest=false')
        expect(job).toContain('dist-runtime/checksums.txt')
    })
    it('keeps the newest 20 and only ever deletes dev-<8 hex> prereleases', () => {
        expect(job).toContain("KEEP_DEV_RELEASES: '20'")
        expect(job).toContain('^dev-[0-9a-f]{8}$')
        expect(job).toContain('isPrerelease')
    })
    it('does not touch the deploy path', () => {
        expect(text.slice(text.indexOf('  deploy:'))).not.toContain('dev-channel')
    })
})
