// .nvmrc is the one Node version: CI reads it (setup-node node-version-file) and
// both Dockerfiles must run the same major. Reference: actions/setup-node docs
// (node-version-file) and nodejs.org/en/about/previous-releases (24 = Active LTS).
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = (p) => readFileSync(path.join(ROOT, p), 'utf8')
const major = read('.nvmrc').trim().replace(/^v/, '').split('.')[0]

describe('one Node version', () => {
    it.each(['Dockerfile', 'serverXR/Dockerfile'])('%s pins node:%s-alpine by digest', (file) => {
        expect(read(file)).toMatch(new RegExp(`^FROM node:${major}-alpine@sha256:[0-9a-f]{64}`, 'm'))
    })

    it('engines accept the .nvmrc major', () => {
        const engines = JSON.parse(read('package.json')).engines.node
        expect(engines).toMatch(new RegExp(`\\b${major}\\.x\\b`))
    })

    it('workflows take the main Node version from .nvmrc, not a literal', () => {
        const allowed = { 'ci.yml': 1, 'install-matrix.yml': 4 } // 22 floor/compat legs, on purpose
        for (const f of readdirSync(path.join(ROOT, '.github/workflows'))) {
            const literals = (read(`.github/workflows/${f}`).match(/^\s*node-version:/gm) || []).length
            expect(literals, f).toBe(allowed[f] || 0)
        }
    })
})
