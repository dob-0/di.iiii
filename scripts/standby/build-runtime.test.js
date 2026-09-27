// @vitest-environment node
//
// build-runtime.sh runs unattended on the standby host, pulled by its deployer. Neither git nor
// curl has a timeout of its own: on 2026-09-28 a `git fetch` of the release commit stalled at
// 38 MB on a dropped link and held the deploy (and its lock) for over ten minutes with nothing
// said anywhere. So every network command in the script must carry a bound. This is a contract on
// the script's text: it fails when someone adds a fetch or a download without one.

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const SCRIPT = fs.readFileSync(path.join(ROOT_DIR, 'scripts', 'standby', 'build-runtime.sh'), 'utf8')

// the script's commands, comments dropped
const lines = SCRIPT.split('\n').map((l) => l.replace(/^\s*#.*$/, '')).filter((l) => l.trim())

describe('build-runtime.sh network commands are bounded', () => {
    it('every git fetch/clone aborts a stalled transfer', () => {
        const git = lines.filter((l) => /^\s*(if\s+)?git(\s+-C\s+\S+)?(\s+-c\s+\S+)*\s+(fetch|clone)\b/.test(l))
        expect(git.length).toBeGreaterThan(0)
        for (const l of git) {
            expect(l, l).toMatch(/http\.lowSpeedLimit=\d+/)
            expect(l, l).toMatch(/http\.lowSpeedTime=\d+/)
        }
    })

    it('every curl has a connect timeout and a total ceiling', () => {
        const curl = lines.filter((l) => /\bcurl\b/.test(l))
        expect(curl.length).toBeGreaterThan(0)
        for (const l of curl) {
            expect(l, l).toMatch(/--connect-timeout \d+/)
            expect(l, l).toMatch(/--max-time \d+/)
        }
    })

    it('the source fetch is retried before the build gives up', () => {
        expect(SCRIPT).toMatch(/for attempt in 1 2 3; do\s*\n\s*if git [^\n]*fetch/)
    })
})
