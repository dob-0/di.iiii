import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// `new URL(import.meta.url).pathname` is `/C:/...` on Windows, and
// `import.meta.url === \`file://${argv[1]}\`` never matches there either, so a
// main-script guard built on them silently does nothing. Use
// scripts/lib/isMainModule.mjs (or fileURLToPath) instead.
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const DIRS = ['scripts', 'serverXR', 'src']
const ALLOW = new Map([
    ['scripts/rigbuild/versions.mjs', 'fixed on its own branch by another session (2026-10-01)']
])
const SELF = 'scripts/noPathnameMainGuard.test.js'
const BAD = [
    /new URL\([^)]*import\.meta\.url\)\s*\.pathname/,
    /import\.meta\.url\s*===?\s*`file:\/\/\$\{/,
    /`file:\/\/\$\{[^}]*argv[^}]*\}`\s*===?\s*import\.meta\.url/
]

function walk(dir, out) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        if (e.name === 'node_modules' || e.name.startsWith('.')) continue
        const p = path.join(dir, e.name)
        if (e.isDirectory()) walk(p, out)
        else if (/\.(mjs|js|cjs)$/.test(e.name)) out.push(p)
    }
}

describe('no pathname-based main-script guard', () => {
    it('finds none outside the allow-list', () => {
        const files = []
        for (const d of DIRS) if (fs.existsSync(path.join(ROOT, d))) walk(path.join(ROOT, d), files)
        expect(files.length).toBeGreaterThan(100)
        const hits = []
        for (const f of files) {
            const rel = path.relative(ROOT, f).split(path.sep).join('/')
            if (rel === SELF || ALLOW.has(rel)) continue
            const lines = fs.readFileSync(f, 'utf8').split('\n')
            lines.forEach((l, i) => { if (BAD.some((re) => re.test(l))) hits.push(`${rel}:${i + 1}: ${l.trim()}`) })
        }
        expect(hits).toEqual([])
    })
})
