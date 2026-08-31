import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, 'package.json'), 'utf8'))
const eslintConfig = fs.readFileSync(path.join(ROOT_DIR, 'eslint.config.js'), 'utf8')

// `"lint": "eslint src --ext .js,.jsx"` was the CI gate for months. It never
// reached serverXR/, scripts/ or shared/, so 49 real errors sat there green —
// and eslint.config.js's config blocks for those paths were unreachable, which
// made the config look like coverage it did not have.

describe('the lint gate covers every tree it claims to', () => {
    const lint = pkg.scripts.lint

    it.each(['src', 'serverXR', 'scripts', 'sdk', 'shared'])('lints %s', (tree) => {
        expect(lint).toMatch(new RegExp(`(^|\\s)${tree}(\\s|$)`))
    })

    it('has config blocks for the Node trees, so they are not linted as browser ESM', () => {
        // serverXR is CommonJS; linting it as ESM produced parse errors that
        // read as real defects and buried the actual ones.
        expect(eslintConfig).toMatch(/serverXR/)
        expect(eslintConfig).toMatch(/sourceType:\s*'commonjs'/)
    })

    it('keeps no-control-regex and no-extra-boolean-cast ON', () => {
        // Both were switched off tree-wide to make the widened gate pass. That
        // silences future violations too. The four real sites are fixed or
        // disabled inline instead; if you need to turn one of these off again,
        // do it on the line, not on the tree.
        expect(eslintConfig).not.toMatch(/'no-control-regex':\s*'off'/)
        expect(eslintConfig).not.toMatch(/'no-extra-boolean-cast':\s*'off'/)
    })
})
