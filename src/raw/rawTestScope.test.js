import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// `npm run test:raw` is a SUBSET — the fast loop for Raw work, not the gate.
// A subset that silently stops covering something is worse than no subset at
// all: it reads as "the Raw tests passed" while the file that would have
// failed was never collected. This test is what keeps the two honest.
//
// The rule it enforces: every test file that imports Raw or node-graph code is
// inside test:raw's scope. Add a test that reaches into src/raw or src/project
// from somewhere the filters don't cover and this goes red, naming the file.
//
// It reads the filters out of package.json rather than restating them, so the
// script and the guard cannot drift apart — the same reason the node anatomy
// manifest stopped being a committed copy.
const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const ROOT = path.resolve(SRC, '..')

const testRawFilters = () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'))
    const script = pkg.scripts['test:raw']
    expect(script, 'package.json has no test:raw script').toBeTruthy()
    return script.replace(/^vitest run\s+/, '').split(/\s+/).filter(Boolean)
}

const testFilesUnder = (dir) => {
    const out = []
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.name === 'node_modules') continue
        const full = path.join(dir, entry.name)
        if (entry.isDirectory()) out.push(...testFilesUnder(full))
        else if (/\.(test|spec)\.(js|jsx)$/.test(entry.name)) out.push(full)
    }
    return out
}

// Reaches into the node graph = imports from src/raw/** or src/project/**.
const IMPORTS_GRAPH = /from\s+'[^']*(?:\.\.\/|\.\/)(?:raw|project)\//

// The one deliberate exclusion, with the reason in the open. This is a
// hand-kept fact, so it is stated once and asserted, never assumed.
const OUT_OF_SCOPE = {
    'src/components/preferences/AdminManageSection.test.jsx':
        'imports project/services/projectsApi.js — the projects REST client, not the node graph. '
        + 'Admin project management is its own lane; a node change cannot break it.'
}

describe('npm run test:raw', () => {
    it('covers every test that reaches into Raw or the node graph', () => {
        const filters = testRawFilters()
        const covered = (relative) => filters.some((filter) => relative.includes(filter.replace(/^\.\.\//, '')))

        const missed = []
        for (const file of testFilesUnder(SRC)) {
            const relative = path.relative(ROOT, file)
            if (!IMPORTS_GRAPH.test(fs.readFileSync(file, 'utf8'))) continue
            if (covered(relative) || relative in OUT_OF_SCOPE) continue
            missed.push(relative)
        }

        expect(missed, `these reach into Raw/the node graph but test:raw would not run them:\n  ${missed.join('\n  ')}`)
            .toEqual([])
    })

    // An exclusion for a file that has moved on is a claim nobody rechecked.
    it('names only real files in its out-of-scope list', () => {
        for (const [file, reason] of Object.entries(OUT_OF_SCOPE)) {
            expect(fs.existsSync(path.join(ROOT, file)), `${file} is excluded but does not exist`).toBe(true)
            expect(reason.length, `${file} is excluded without a reason`).toBeGreaterThan(20)
        }
    })
})
