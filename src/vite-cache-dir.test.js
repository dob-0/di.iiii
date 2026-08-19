// @vitest-environment node
//
// Regression guard: the dep-optimizer cache must live in the worktree, never
// in node_modules.
//
// Worktrees symlink node_modules back to the main checkout, so vite's default
// `node_modules/.vite` resolves to the SAME directory for every dev server on
// this machine. A second server re-optimizing rewrites the chunk files under
// the first, which then serves `@react-three/fiber` from the pre-swap chunk and
// `@react-three/xr` from the post-swap one — two copies of R3F, two React
// contexts, and every Canvas throws "R3F: Hooks can only be used within the
// Canvas component!" on a page nobody touched. See docs/ai/known-fixes.md.

import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const config = readFileSync(path.join(REPO_ROOT, 'vite.config.js'), 'utf8')

describe('vite dep-optimizer cache', () => {
    it('is set explicitly, so it never falls back to the shared node_modules/.vite', () => {
        expect(config).toMatch(/cacheDir:/)
    })

    it('resolves against the config file\'s own directory, so each worktree gets its own', () => {
        expect(config).toMatch(/cacheDir:\s*path\.resolve\(ROOT_DIR,\s*'\.vite-cache'\)/)
    })

    it('does not point back inside node_modules', () => {
        const line = config.split('\n').find((l) => l.includes('cacheDir:'))
        expect(line).not.toContain('node_modules')
    })

    it('keeps the cache directory out of git', () => {
        expect(readFileSync(path.join(REPO_ROOT, '.gitignore'), 'utf8'))
            .toMatch(/^\.vite-cache\/$/m)
    })
})
