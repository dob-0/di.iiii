import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import { composeFiles } from './runner-docker.mjs'
// ?raw hands us the file's text without executing it — vitest serves this
// module over an http-scheme URL, so import.meta.url cannot be given to fs.
import packRuntimeSource from '../pack-runtime.mjs?raw'

// docker mode composed a broken stack for as long as it existed: the runner
// passed a single -f with docker-compose.di.yml, but that file is only an
// OVERRIDE — `build: !reset null`, `ports: !override`, and no volume
// definitions at all. Composed alone, the named `di-local_data` volume never
// exists, so the artist's work lands in an anonymous volume while `di where`
// points at the named one. CI has always run BOTH files
// (install-matrix.yml: `-f docker-compose.yml -f docker-compose.di.yml`),
// which is why the drift never failed a job.
describe('docker runner compose files', () => {
    let home = null

    afterEach(() => {
        if (home) fs.rmSync(home, { recursive: true, force: true })
        home = null
    })

    const installFixture = () => {
        home = fs.mkdtempSync(path.join(os.tmpdir(), 'di-home-'))
        const versionDir = path.join(home, 'versions', '1.0.0')
        fs.mkdirSync(versionDir, { recursive: true })
        fs.symlinkSync(versionDir, path.join(home, 'current'), 'dir')
        return versionDir
    }

    it('composes the base file and the override, in that order', () => {
        const versionDir = installFixture()
        expect(composeFiles(home)).toEqual([
            path.join(versionDir, 'docker-compose.yml'),
            path.join(versionDir, 'docker-compose.di.yml')
        ])
    })

    it('refuses to guess when nothing is installed', () => {
        home = fs.mkdtempSync(path.join(os.tmpdir(), 'di-home-'))
        expect(() => composeFiles(home)).toThrow(/not installed/)
    })
})

// The runtime tarball must actually CONTAIN the base file, or the runner fix
// above just moves the failure from "wrong volume" to "missing file".
describe('pack-runtime packs both compose files', () => {
    it('stages docker-compose.yml alongside the override', () => {
        expect(packRuntimeSource).toContain("'docker-compose.yml'")
        expect(packRuntimeSource).toContain("'docker-compose.di.yml'")
    })
})
