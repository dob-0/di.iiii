// @vitest-environment node
import { describe, it, expect } from 'vitest'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { ESLint } from 'eslint'

// The jsx-a11y rules the editor once relaxed to warnings are errors now, and the
// files that held the last 17 warnings (CI run 39482426718, 2026-10-20) hold none.
// A warning never failed CI; this does, and so does `npm run lint`.
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const RULES = [
    'jsx-a11y/label-has-associated-control',
    'jsx-a11y/media-has-caption',
    'jsx-a11y/click-events-have-key-events',
    'jsx-a11y/no-static-element-interactions'
]
const FILES = [
    'src/studio/components/SceneEditor.jsx',
    'src/raw/components/DesktopWindow.jsx',
    'src/raw/components/RawEditor.jsx',
    'src/raw/components/RawGraphSurface.jsx',
    'src/raw/utils/webcamCapture.test.jsx'
]

describe('jsx-a11y in the editor', () => {
    const eslint = new ESLint({ cwd: repo })

    it('the four relaxed rules are errors for every .jsx file', async () => {
        const config = await eslint.calculateConfigForFile(path.join(repo, FILES[0]))
        for (const rule of RULES) {
            const entry = config.rules[rule]
            expect([rule, Array.isArray(entry) ? entry[0] : entry]).toEqual([rule, 2])
        }
    })

    it('the files that held the last warnings report no jsx-a11y problem', async () => {
        const results = await eslint.lintFiles(FILES.map((f) => path.join(repo, f)))
        const found = results.flatMap((r) => r.messages
            .filter((m) => (m.ruleId || '').startsWith('jsx-a11y/'))
            .map((m) => `${path.relative(repo, r.filePath)}:${m.line} ${m.ruleId}`))
        expect(found).toEqual([])
    }, 60000)
})
