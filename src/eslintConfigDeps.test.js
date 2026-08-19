import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// eslint.config.js is loaded by the eslint binary, not by vite, so nothing in
// the build graph ever resolves its imports. A package it imports without
// declaring survives for exactly as long as some other dependency happens to
// pull it in — `@eslint/js` rode along with eslint 9 and vanished under
// eslint 10. Worse, that failure hides locally: worktrees under
// .claude/worktrees/ sit INSIDE the main checkout, so Node walks up and finds
// the parent tree's node_modules. Only a clean install fails, and by then it
// is CI's problem.
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

const packageNameOf = (specifier) => {
    if (specifier.startsWith('.') || specifier.startsWith('/') || specifier.startsWith('node:')) return null
    const parts = specifier.split('/')
    return specifier.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0]
}

describe('eslint.config.js dependencies', () => {
    it('declares every package it imports', () => {
        const source = fs.readFileSync(path.join(repoRoot, 'eslint.config.js'), 'utf8')
        const manifest = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'))
        const declared = new Set([
            ...Object.keys(manifest.dependencies || {}),
            ...Object.keys(manifest.devDependencies || {})
        ])

        const imported = [...source.matchAll(/(?:^|\n)\s*import\s+(?:[^'"]*?\s+from\s+)?['"]([^'"]+)['"]/g)]
            .map((match) => packageNameOf(match[1]))
            .filter(Boolean)

        expect(imported.length).toBeGreaterThan(0)
        expect([...new Set(imported)].filter((name) => !declared.has(name))).toEqual([])
    })
})
