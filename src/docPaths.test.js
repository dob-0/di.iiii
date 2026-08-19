import { describe, expect, it } from 'vitest'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

// The Raw help dialog shipped a link to `docs/raw/USER_MANUAL.md` for a week
// with no such file — the Seed->Raw rename renamed the string but not the
// document. Any `docs/....md` path we show a user has to resolve to a real
// file, so the next rename fails here instead of in front of them.

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const SOURCE_DIRS = ['src', 'serverXR/src']
const SOURCE_EXT = /\.(js|jsx)$/
const DOC_PATH = /docs\/[A-Za-z0-9_./-]+\.md/g

function collectSourceFiles(dir, out = []) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue
        const full = join(dir, entry.name)
        if (entry.isDirectory()) collectSourceFiles(full, out)
        // this file's own prose contains a placeholder path, not a real link
        else if (SOURCE_EXT.test(entry.name) && entry.name !== 'docPaths.test.js') out.push(full)
    }
    return out
}

describe('doc paths referenced from application source', () => {
    it('every docs/*.md path in src resolves to a real file', () => {
        const missing = []
        for (const dir of SOURCE_DIRS) {
            const abs = join(ROOT, dir)
            if (!existsSync(abs) || !statSync(abs).isDirectory()) continue
            for (const file of collectSourceFiles(abs)) {
                const text = readFileSync(file, 'utf8')
                for (const match of text.match(DOC_PATH) || []) {
                    if (!existsSync(join(ROOT, match))) {
                        missing.push(`${file.slice(ROOT.length + 1)} -> ${match}`)
                    }
                }
            }
        }
        expect(missing).toEqual([])
    })
})
