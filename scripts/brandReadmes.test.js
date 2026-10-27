// The repo's front pages say the names and words the way the rules do.
//
// di-brand NAMING.md (spec v2 §1): the platform is `di.iiii`, and "nothing is
// appended" to it — a heading like "di.iiii Control Server" fuses a word onto
// the name. docs/ai/vocabulary.md retires `Beta` (the lane was deleted
// 2026-08-06; `src/beta/` does not exist), `lane`, and `Raw` as a name (say
// Nodes). On 2026-10-21 six headings fused a word onto the name, serverXR's
// README still listed Beta as a supported editor, and the SDK README told a
// reader to import from 'di.iiii/sdk', a package that does not exist.
import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { describe, expect, it } from 'vitest'

const repoDir = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = (path) => readFileSync(join(repoDir, path), 'utf8')

const HEADED_FILES = [
    'serverXR/README.md',
    'docs/deck/README.md',
    'docs/ECOSYSTEM.md',
    'docs/ai/roles/README.md',
    'sdk/README.md',
    'docs/ai/roles/ui-ux-engineer.md'
]

// Lines outside fenced code blocks.
const proseLines = (text) => {
    let fenced = false
    return text.split('\n').filter((line) => {
        if (/^\s*```/.test(line)) {
            fenced = !fenced
            return false
        }
        return !fenced
    })
}

describe('front pages: names and words', () => {
    it.each(HEADED_FILES)('%s: no heading appends a word to di.iiii', (path) => {
        const headings = proseLines(read(path)).filter((line) => /^#{1,6}\s/.test(line))
        expect(headings.length).toBeGreaterThan(0)
        expect(headings.filter((line) => /di\.iiii [A-Za-z]/.test(line))).toEqual([])
    })

    it('serverXR/README.md names no Beta editor', () => {
        const hits = read('serverXR/README.md').split('\n').filter((line) => /\bBeta\b/.test(line))
        expect(hits).toEqual([])
    })

    it.each([
        ['docs/deck/README.md', /\blanes?\b/i],
        ['ONBOARDING.md', /\bRaw\b/]
    ])('%s holds no retired word', (path, word) => {
        const hits = read(path).split('\n').filter((line) => word.test(line))
        expect(hits).toEqual([])
    })

    it('every import sdk/README.md shows resolves, from the repo root', async () => {
        const text = read('sdk/README.md')
        const imports = [...text.matchAll(/import \{([^}]+)\} from '([^']+)'/g)]
        expect(imports.length).toBeGreaterThan(0)
        for (const [, names, specifier] of imports) {
            expect(specifier, `${specifier} is not a path inside this repo`).toMatch(/^\.\//)
            const mod = await import(pathToFileURL(resolve(repoDir, specifier)).href)
            for (const name of names.split(',').map((n) => n.trim()).filter(Boolean)) {
                expect(mod[name], `${specifier} exports ${name}`).toBeDefined()
            }
        }
    })
})
