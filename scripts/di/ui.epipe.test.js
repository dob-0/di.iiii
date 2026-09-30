import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const ui = path.join(path.dirname(fileURLToPath(import.meta.url)), 'ui.mjs')

// A reader that closes the pipe early (`di status | head -1`) must not crash us.
describe('ui: closed pipe', () => {
    it('exits 0 with no stack trace when stdout is closed early', () => {
        const js = `import(${JSON.stringify(ui)}).then(({ say }) => { setInterval(() => say('x'.repeat(65536)), 1); setTimeout(() => process.exit(3), 3000) })`
        const r = spawnSync('bash', ['-c', 'node --input-type=module -e "$JS" | head -c 1 >/dev/null; exit ${PIPESTATUS[0]}'], {
            encoding: 'utf8',
            env: { ...process.env, JS: js },
        })
        expect(r.stderr).not.toMatch(/EPIPE|Unhandled/)
        expect(r.status).toBe(0)
    })
})
