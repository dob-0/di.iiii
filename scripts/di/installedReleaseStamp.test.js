// @vitest-environment node
//
// The installed di's /serverXR/api/health reports the release stamp that
// scripts/pack-runtime.mjs wrote at the version root (serverXR/src/releaseInfo.js
// reads <version>/release.json, one folder above serverXR/). That is a promise
// between two files that never import each other, so the writer's half is
// pinned here: if the packer moves the file, or renames a key the server reads,
// health goes back to answering release = all null (what it did until
// 2026-10-10) and nothing else fails, because null is a valid answer.
// serverXR/src/releaseInfo.test.js has the reader's half.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const read = (p) => readFileSync(join(ROOT, p), 'utf8')
const require = createRequire(import.meta.url)
const { normalizeReleaseInfo } = require('../../serverXR/src/releaseInfo')

const packer = read('scripts/pack-runtime.mjs')

// The top-level keys of the object the packer writes into release.json, read
// from its source (8 spaces in, `key,` or `key:`), so there is no second list
// of them to drift.
const packedKeys = () => {
    const start = packer.indexOf("path.join(stage, 'release.json')")
    expect(start, 'pack-runtime.mjs no longer writes <stage>/release.json').toBeGreaterThan(-1)
    const end = packer.indexOf('}, null, 2)', start)
    expect(end, 'could not find the end of the release.json object in pack-runtime.mjs').toBeGreaterThan(start)
    return [...packer.slice(start, end).matchAll(/^ {8}(\w+)\s*[,:]/gm)].map((match) => match[1])
}

describe('the packer still leaves the stamp where the installed server looks for it', () => {
    it('writes release.json at the version root, with serverXR/ copied directly inside it', () => {
        // Reader: path.join(config.directories.root, '..', 'release.json'), root = <version>/serverXR.
        expect(packer).toContain("path.join(stage, 'release.json')")
        expect(packer).toContain("path.join(stage, 'serverXR', 'src')")
    })

    it('writes the keys the server turns into version, commit and time', () => {
        // version -> release.version / releaseId, gitCommit -> release.gitCommit, packedAt -> release.generatedAt.
        expect(packedKeys()).toEqual(expect.arrayContaining(['version', 'gitCommit', 'packedAt']))
    })

    it('and a stamp with those keys reads back as a release, not as nulls', () => {
        const stamp = Object.fromEntries(packedKeys().map((key) => [key, {
            version: '0.4.4-dev.5b37c82f',
            gitCommit: '5b37c82fcd8c5a4446f536090e3868a4f248c43c',
            packedAt: '2026-10-09T13:58:49.745Z'
        }[key] ?? 'x']))

        expect(normalizeReleaseInfo(stamp)).toMatchObject({
            version: '0.4.4-dev.5b37c82f',
            releaseId: '0.4.4-dev.5b37c82f',
            gitCommit: '5b37c82fcd8c5a4446f536090e3868a4f248c43c',
            generatedAt: '2026-10-09T13:58:49.745Z'
        })
    })
})
