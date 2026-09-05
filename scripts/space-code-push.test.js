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

// Three bugs shipped together in this script and each one was silent: it printed
// "ok — 1 file(s) pushed" while the published page stayed empty. The guards below
// read the SERVER as the source of truth so the script cannot drift from it again.

const SERVER_ROUTES = fs.readFileSync(
    path.join(ROOT_DIR, 'serverXR', 'src', 'routes', 'projectRoutes.js'), 'utf8')
const SYNC_PLAN = fs.readFileSync(
    path.join(ROOT_DIR, 'serverXR', 'src', 'spaceSyncPlan.js'), 'utf8')

describe('space-code-push writes what the server actually accepts', () => {
    it('uses a method serverXR registers on /api/projects/:projectId/document', () => {
        // PATCH matched no route and returned a bare 404, which reads exactly
        // like a missing project — the wrong thing to go looking for.
        const method = code.match(/method:\s*'([A-Z]+)'/)?.[1]
        expect(method).toBeTruthy()
        const registered = [...SERVER_ROUTES.matchAll(
            /router\.(get|put|post|patch|delete)\('\/api\/projects\/:projectId\/document'/g)
        ].map((m) => m[1].toUpperCase())
        expect(registered).toContain(method)
    })

    it('sets every presentationState key spaceSyncPlan sets', () => {
        // The viewer keys on entryView ("showCodeView = entryView === 'code'"),
        // not on mode. Setting mode alone left the page showing an empty scene.
        for (const key of ['mode', 'entryView', 'codeFiles']) {
            expect(SYNC_PLAN).toMatch(new RegExp(`\\b${key}\\b`))
            expect(code).toMatch(new RegExp(`\\b${key}\\b`))
        }
        expect(code).toMatch(/shareEnabled/)
    })
})

describe('space-new finds the token where it actually lives', () => {
    it('reads serverXR/.env.local, like its sibling scripts', () => {
        // LIVE_API_TOKEN lives in serverXR/.env.local. Reading only the root
        // .env.local made space-new report "LIVE_API_TOKEN is required" on a
        // repo that had one, and send the operator to the browser for nothing.
        const spaceNew = fs.readFileSync(path.join(ROOT_DIR, 'scripts', 'space-new.mjs'), 'utf8')
        expect(spaceNew).toMatch(/'serverXR',\s*'\.env\.local'/)
    })
})
