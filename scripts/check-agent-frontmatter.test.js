// Every sub-agent file uses only frontmatter keys Claude Code knows.
// Source: https://code.claude.com/docs/en/sub-agents (read 2026-10-09): "Claude Code ignores a field it doesn't recognize
// without reporting an error." Until 2026-10-09 all 11 agents here used `allowed-tools` (a skills key), so their tool
// limits were silently ignored and the read-only auditors could edit. `tools` takes tool names only, no Bash(...) patterns.
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const DIR = join(__dirname, '..', '.claude', 'agents')
const KNOWN = new Set(['name', 'description', 'tools', 'disallowedTools', 'model', 'permissionMode', 'maxTurns', 'skills',
    'mcpServers', 'hooks', 'memory', 'background', 'omitClaudeMd', 'effort', 'isolation', 'color', 'initialPrompt', 'experimental'])
const MODELS = new Set(['sonnet', 'opus', 'haiku', 'fable', 'inherit'])
const READ_ONLY = new Set(['security', 'release-verifier', 'silent-failure-hunter', 'human-verifier'])

const agents = readdirSync(DIR).filter((f) => f.endsWith('.md')).map((f) => {
    const text = readFileSync(join(DIR, f), 'utf8')
    const fm = /^---\n([\s\S]*?)\n---\n/.exec(text)?.[1] ?? ''
    const keys = Object.fromEntries(fm.split('\n').map((l) => /^([A-Za-z][\w-]*):\s*(.*)$/.exec(l)).filter(Boolean).map((m) => [m[1], m[2].trim()]))
    return { file: f, keys }
})

describe('.claude/agents frontmatter', () => {
    it('finds the agent files', () => expect(agents.length).toBeGreaterThan(0))
    for (const { file, keys } of agents) {
        it(`${file}: only documented keys`, () => expect(Object.keys(keys).filter((k) => !KNOWN.has(k))).toEqual([]))
        it(`${file}: name, description and a known model`, () => {
            expect(keys.name).toBeTruthy()
            expect(keys.description).toBeTruthy()
            if (keys.model) expect(MODELS.has(keys.model) || keys.model.startsWith('claude-')).toBe(true)
        })
        it(`${file}: tools are names, not Bash(...) patterns`, () => expect(keys.tools ?? '').not.toMatch(/\w\(/))
        if (READ_ONLY.has(file.replace(/\.md$/, ''))) {
            it(`${file}: a read-only role has no Edit or Write`, () => {
                expect(keys.tools).toBeTruthy()
                expect(keys.tools.split(/,\s*/)).not.toContain('Edit')
                expect(keys.tools.split(/,\s*/)).not.toContain('Write')
            })
        }
    }
})
