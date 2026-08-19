import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const SCRIPT = path.join(ROOT_DIR, 'scripts', 'space-code-push.mjs')
const source = fs.readFileSync(SCRIPT, 'utf8')

// Comments legitimately quote the removed constant (that is how the next reader
// learns why it must not come back), and the --help text legitimately prints
// both host URLs. Assert against code only, so the guard cannot be satisfied by
// deleting the explanation.
const code = source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((line) => !line.trim().startsWith('//'))
    .join('\n')

// Same guard space-sync.mjs already carries, for the same bug in the sibling
// script. This one writes a space's code files into a published project, so a
// forgotten flag rewrote the live exhibition page rather than the rehearsal.

describe('space-code-push names no default target', () => {
    it('carries no DEFAULT_LIVE_URL and no hardcoded production host', () => {
        // `DEFAULT_LIVE_URL = 'https://di-studio.xyz/serverXR'` meant a push
        // with neither --to nor LIVE_API_URL published straight to production,
        // and reported success — the repo's own named silent-fallback class.
        // Matches a declaration, not a mention — the comment explaining why the
        // constant was removed is the kind of thing that should survive.
        expect(code).not.toMatch(/^\s*(const|let|var)\s+DEFAULT_LIVE_URL/m)
        // No assignment of the production host anywhere in executable code.
        expect(code).not.toMatch(/=\s*'https:\/\/di-studio\.xyz/)
    })

    it('fails loudly when no target is resolvable, instead of picking one', () => {
        // A rehearsal that forgets a flag must stop, not publish.
        expect(code).toMatch(/no target/i)
        expect(code).toMatch(/process\.exitCode\s*=\s*1/)
    })
})
