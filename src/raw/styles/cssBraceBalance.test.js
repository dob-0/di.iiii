import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// One unclosed brace turns every rule after it into a NESTED rule (CSS
// nesting is real syntax now, so nothing errors): .raw-agent-run-panel-tail
// once swallowed the entire timeline-panel stylesheet, the director-window
// overrides, and the zen wordmark — they all silently applied only inside an
// agent-run panel. Brace balance is the cheapest executable contract for it.
const stylesDir = dirname(fileURLToPath(import.meta.url))

describe('raw stylesheet brace balance', () => {
    for (const file of readdirSync(stylesDir).filter((f) => f.endsWith('.css'))) {
        it(`${file} closes every block it opens`, () => {
            const src = readFileSync(join(stylesDir, file), 'utf8')
            let depth = 0
            let line = 1
            for (const ch of src) {
                if (ch === '\n') line += 1
                else if (ch === '{') depth += 1
                else if (ch === '}') {
                    depth -= 1
                    expect(depth, `extra "}" at ${file}:${line}`).toBeGreaterThanOrEqual(0)
                }
            }
            expect(depth, `${depth} unclosed "{" in ${file}`).toBe(0)
        })
    }
})
