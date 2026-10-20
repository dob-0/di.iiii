// No live surface names the studio in a retired form.
//
// The naming rules (di-brand NAMING.md): `di.iiii` is the platform, `di.i` is
// the studio — "if it ships or runs, four i's; if it signs, one". The
// descriptor `studio_network` was retired on 2026-09-02: "The studio does not
// describe itself; it signs. A person is `Name — di.i`. The platform is
// `di.iiii`. Nothing is appended to either."
//
// On 2026-10-20 three network rooms still printed `di.iiii XR studio_network`
// as an employer, seven weeks after the retirement, because the roster they
// are built from was never swept. Nothing failed: copy rots silently.
//
// The scan is every tracked text file. A dated history entry — a log line
// that records what was said on a past date — keeps its words; those files
// are listed below with the reason, and an allowlisted line that stops
// matching fails, so the list cannot outlive its excuse.
import { execFileSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const repoDir = join(dirname(fileURLToPath(import.meta.url)), '..')

// The owner's search, verbatim.
const RETIRED = 'studio_network|di\\.ii XR|di\\.i studio|di\\.i ստուդիա'

// Whole files that are dated logs.
const HISTORY_FILES = [
    'PROGRESS.md',                 // the dated log; every hit sits under a `## <date>` heading
    'docs/ai/known-fixes.md',      // dated defect log
    'docs/ai/sessions/',           // notes that fold into PROGRESS.md
    'scripts/retiredStudioNames.test.js' // this guard names what it bans
]

// Single lines in live files that record a past name, each with its reason.
const ALLOWED_LINES = [
    {
        file: 'docs/deck/README.md',
        includes: 'It was tracked as `di.ii XR studio_network .pdf` until',
        why: 'records the file\'s old tracked name and the date it was renamed (2026-09-02)'
    }
]

const hits = () => {
    let out = ''
    try {
        out = execFileSync('git', ['grep', '-n', '-I', '-E', RETIRED], { cwd: repoDir, encoding: 'utf8' })
    } catch (err) {
        if (err.status === 1) return [] // git grep: no match
        throw err
    }
    return out.split('\n').filter(Boolean).map((row) => {
        const [file, line, ...rest] = row.split(':')
        return { file, line: Number(line), text: rest.join(':') }
    })
}

describe('retired studio names', () => {
    const all = hits()
    const live = all.filter((h) => !HISTORY_FILES.some((f) => (f.endsWith('/') ? h.file.startsWith(f) : h.file === f)))

    it('appear on no live surface', () => {
        const unexplained = live
            .filter((h) => !ALLOWED_LINES.some((a) => a.file === h.file && h.text.includes(a.includes)))
            .map((h) => `${h.file}:${h.line}: ${h.text.trim().slice(0, 160)}`)
        expect(unexplained).toEqual([])
    })

    it('keeps no allowlist row that no longer matches', () => {
        const stale = ALLOWED_LINES
            .filter((a) => !live.some((h) => h.file === a.file && h.text.includes(a.includes)))
            .map((a) => a.file)
        expect(stale).toEqual([])
    })
})
