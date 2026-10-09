/**
 * What goes into the shipped JavaScript.
 *
 * Vite replaces `import.meta.env.NAME` with that one value at build time, but a
 * bare `import.meta.env` (passed along, spread, used as a default) becomes an
 * object literal holding EVERY `VITE_*` variable of the build. Checked with
 * Vite 8.3.3 on 2026-10-09: `function f(env = import.meta.env)` put a
 * sentinel `VITE_*` value into the bundle; `import.meta.env.X` and
 * `import.meta.env?.X` did not.
 *
 * So two rules, both checked here:
 *   1. Client code reads named keys only.
 *   2. No build step hands the build a credential under a `VITE_*` name.
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')

const walk = (dir, out = []) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue
        const full = path.join(dir, entry.name)
        if (entry.isDirectory()) walk(full, out)
        else out.push(full)
    }
    return out
}

const stripComments = (code) => code
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:\\])\/\/.*$/gm, '$1')

// `import.meta.env` NOT followed by `.name` or `?.name`.
const WHOLE_ENV = /import\.meta\.env(?!\s*\??\.\s*[A-Za-z_$])/g

// A VITE_* name that says it holds a credential.
const SECRET_VITE_NAME = /\bVITE_[A-Z0-9_]*(TOKEN|SECRET|PASSWORD|PRIVATE|CREDENTIAL)[A-Z0-9_]*\b/

describe('client code reads build env by name only', () => {
    it('has no bare import.meta.env in src/ or shared/', () => {
        const files = ['src', 'shared']
            .flatMap((dir) => walk(path.join(repoRoot, dir)))
            .filter((file) => /\.(jsx?|mjs|tsx?)$/.test(file) && !/\.(test|spec)\.[jt]sx?$/.test(file))
        const offenders = []
        for (const file of files) {
            const code = stripComments(fs.readFileSync(file, 'utf8'))
            if (WHOLE_ENV.test(code)) offenders.push(path.relative(repoRoot, file))
            WHOLE_ENV.lastIndex = 0
        }
        expect(offenders).toEqual([])
    })
})

describe('no build step passes a credential as VITE_*', () => {
    const sources = [
        ...fs.readdirSync(path.join(repoRoot, '.github', 'workflows')).map((f) => path.join('.github', 'workflows', f)),
        'scripts/dev-stack.mjs',
        'scripts/stage-cpanel-nodeapp-release.mjs',
        'scripts/cpanel-apply-prebuilt-release.sh',
        'deploy/cpanel/frontend.env.production.example',
        'deploy/cpanel/cpanel.deploy.env.example',
        '.env.example'
    ]

    it.each(sources)('%s', (rel) => {
        const lines = fs.readFileSync(path.join(repoRoot, rel), 'utf8').split('\n')
        const hits = lines
            .map((line, i) => ({ line: line.trim(), n: i + 1 }))
            .filter(({ line }) => !line.startsWith('#') && !line.startsWith('//') && !line.startsWith('*'))
            .filter(({ line }) => SECRET_VITE_NAME.test(line))
            .map(({ line, n }) => `${rel}:${n}: ${line}`)
        expect(hits).toEqual([])
    })
})
