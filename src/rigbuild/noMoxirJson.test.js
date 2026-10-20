// Part 3 of the split of PR #914: the one-file copy of the fixture library (types/moxir.json) is gone;
// everything reads the per-type library (src/rigbuild/types/library/, via TYPE_LIBRARY or loadLibrary()).
// This fails the build if a code file names the old file again.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const OLD = ['types', 'moxir.json'].join('/')
const CODE = /\.(js|jsx|mjs|cjs|ts|py)$/
const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    if (e.name === 'node_modules' || e.name.startsWith('.')) return []
    const p = path.join(dir, e.name)
    return e.isDirectory() ? walk(p) : CODE.test(e.name) ? [p] : []
})

describe('the old one-file fixture library', () => {
    it('is deleted', () => expect(fs.existsSync(path.join(ROOT, 'src/rigbuild/types/moxir.json'))).toBe(false))
    it('is named by no code file in src, scripts, shared or serverXR', () => {
        const hits = ['src', 'scripts', 'shared', 'serverXR'].flatMap((d) => walk(path.join(ROOT, d)))
            .filter((f) => !f.endsWith('noMoxirJson.test.js') && fs.readFileSync(f, 'utf8').includes(OLD))
            .map((f) => path.relative(ROOT, f))
        expect(hits).toEqual([])
    })
})
