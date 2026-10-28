// The public address is diiii.xyz; di-studio.xyz is the old one.
//
// The owner, 2026-10-21: "diiii.xyz main public". diiii.xyz is the one public
// address of di.iiii, and di-studio.xyz is the old address that forwards to it.
// On that day dev still named di-studio.xyz in 222 files (539 times): links,
// canonical URLs, CLI defaults, page sources. Nothing failed, because the old
// name still answers — an old address spreads silently.
//
// The scan is every tracked text file. Two kinds of file may still name it:
//   - dated history (a log line records what was true on a past date), whole;
//   - a file where the old name must keep working while it forwards (host and
//     origin allowlists, CORS, OAuth callbacks registered with a provider, tests
//     of the alias), or that records a past incident. Each is listed with the
//     exact number of times it may name it and why. One more fails (new code
//     brought it in); one fewer also fails, so a row cannot outlive its excuse.
import { execFileSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const repoDir = join(dirname(fileURLToPath(import.meta.url)), '..')

const OLD = 'di-studio\\.xyz'

// Whole files and folders that are dated logs or retired runbooks.
const HISTORY = [
    'PROGRESS.md',                     // the dated log
    'docs/ai/known-fixes.md',          // dated defect log
    'docs/ai/sessions/',               // notes that fold into PROGRESS.md
    'docs/ai/audit-',                  // dated audits (2026-06-22, 2026-06-24)
    'docs/checkpoints/',               // dated checkpoints
    'docs/research/',                  // dated research and its HTML mirrors
    'docs/deploy/legacy/',             // retired PM2/cPanel runbooks
    'legacy/',                         // retired cPanel git-pull scripts
    'scripts/oldAddress.test.js'       // this guard names what it bans
]

// file → [times it may name di-studio.xyz, why]
const ALLOWED = {
    // The old name must keep working while it forwards.
    'serverXR/src/config.js': [1, 'platform host list: a request on the old name is the platform, not a custom domain'],
    'src/utils/hostSpace.js': [1, 'platform suffixes: same list, client side'],
    'src/index.html': [2, 'comment listing every address the platform answers on'],
    'scripts/space-push.mjs': [3, 'production-host refusal list names both addresses'],
    'scripts/tier-sync.mjs': [2, 'production-host refusal list names both addresses'],
    'scripts/space-sync.mjs': [1, 'both addresses count as production when retargeting a page'],
    'scripts/page-vendor-cdn.mjs': [1, 'help text: --api on either address is refused'],
    'scripts/rigbuild/show-clock.mjs': [1, 'help text: either address is production'],
    'sdk/credentials.js': [3, 'SITE_ALIASES: a base on the old address finds the prod login'],
    'scripts/di/loginStore.mjs': [2, 'SITE_ALIASES: `di login --to` the old address files under prod'],
    'scripts/cpanel-apply-prebuilt-release.sh': [3, 'CORS keeps both names; one line records the 2026-09-16 retirement of staging.'],
    'scripts/deploy.mjs': [1, 'SSH host of the legacy cPanel account, a machine name, not a link'],
    'serverXR/.env.example': [4, 'OAuth callbacks registered with GitHub/Google on the old name, and the mail sender domain — change with the providers, not here'],
    'docs/ops/GOOGLE_DRIVE_INTEGRATION.md': [2, 'the Drive OAuth callback as registered with Google'],
    'docs/architecture/SPEC_github_app_one_click.md': [3, 'the GitHub App homepage, callback and webhook as registered with GitHub'],
    'docs/deploy/LIVE_DEPLOY.md': [2, 'why the old name stays routed (sign-in calls back on it)'],
    '.github/workflows/uptime.yml': [1, 'probes the old name too, so the forward is watched'],
    '.github/workflows/publish-cpanel-prebuilt-v2.yml': [1, 'workflow file; cloud sessions cannot push workflows — owner to change'],
    '.github/workflows/deploy-space-code.yml': [1, 'workflow file; cloud sessions cannot push workflows — owner to change'],

    // Tests of the alias.
    'scripts/di/login.test.js': [2, '`di login --to` the old address is still prod'],
    'scripts/di/loginStore.test.js': [4, 'the old address files and resolves under prod'],
    'scripts/space-push.test.js': [2, 'the old address is refused as production'],
    'scripts/tier-sync.test.js': [1, 'the old address is refused as production'],
    'scripts/page-vendor-cdn.test.js': [3, 'the old address is refused as production'],
    'scripts/sitemap.mjs': [1, 'comment: says the old address still serves the same place'],
    'scripts/sitemap.test.js': [1, 'guard: the sitemap never names the old address'],
    'scripts/space/apply-structure.test.mjs': [4, 'fixture: a text edit from the old address to the new'],
    'scripts/space/combine-pages.test.mjs': [6, 'fixture: pages that hard-code the old host are rewritten'],
    'scripts/space/pages-lib.address.test.mjs': [1, 'fixture: a hard-coded old host in a page is rewritten'],
    'scripts/space/pages-lib.mjs': [1, 'comment: names the old host the rewrite removes'],
    'scripts/suitePage.test.mjs': [3, 'guard: the suite page never names the old address'],
    'serverXR/src/domainService.test.js': [2, 'platform host list includes the old name'],
    'serverXR/src/domainAddRace.test.js': [1, 'platform host list includes the old name'],
    'serverXR/src/googleOAuth.test.js': [1, 'the registered Drive callback'],
    'src/utils/hostSpace.test.js': [1, 'the old name is a platform host'],
    'src/utils/deployMode.test.js': [2, 'the old name reads as hosted; the `dev.` first-label rule holds on it'],
    'src/positioningLine.test.js': [1, 'comment: the README link that named the old address'],
    'src/components/ModeMark.test.jsx': [1, 'no mode mark on the old name either'],

    // Words about the old address itself.
    'CONTRIBUTING.md': [2, 'says the old names and what became of them'],
    'docs/ai/vocabulary.md': [2, 'the address decision and the 2026-09-16 staging retirement'],
    'docs/architecture/THREE_DISTANCES.md': [1, 'the address decision'],
    'MANIFESTO.md': [1, 'owner text: the old name keeps answering for everything already printed'],
    'docs/architecture/SPEC_space_own_domain.md': [1, 'lists our own platform names, both'],
    'spaces/open/tools/set-jam-qr.mjs': [1, 'what the printed QR in the room encodes'],

    // A past incident or a past state, recorded with its date or as "used to".
    'docs/ai/roles/infrastructure-engineer.md': [1, 'staging. switched off 2026-09-16'],
    'docs/deploy/CPANEL_DEPLOYMENT.md': [1, 'staging. retired 2026-09-16'],
    'docs/deploy/CPANEL_PREBUILT_DEPLOY.md': [1, 'staging. retired 2026-09-16'],
    'docs/deploy/STUDIO_CHAT_APK.md': [1, 'the twin APK already built is locked to staging.'],
    'docs/deploy/DI_CLI.md': [1, 'quotes the message an install printed before 2026-09-10'],
    'docs/ECOSYSTEM.md': [1, 'a query dated 2026-08-10'],
    'docs/moxir/BUILD_REHEARSAL_2026-10-07.md': [1, 'dated rehearsal record'],
    'docs/testing/FESTIVAL_MACHINE_2026-09-06.md': [1, 'dated test record: the QR then pointed there'],
    'nginx.conf': [1, 'the incident the og rule fixed'],
    'src/deploy-compose.test.js': [2, 'the incidents these cases guard'],
    'src/copyVocabulary.test.js': [1, 'example of a hit the vocabulary guard catches'],
    'spaces/network/network-pages.test.js': [1, 'the 2026-09-28 incident the case guards'],
    'scripts/space-code-push.mjs': [1, 'the old default that pushed to production'],
    'scripts/space-code-push.test.js': [1, 'the old default that pushed to production'],
    'scripts/space-sync.test.js': [1, 'the old default that synced to production'],
    'scripts/space-sync-vendor.mjs': [1, 'the old default it was copied from'],
    'src/works/buildProfile.js': [1, 'quotes the message the slim install printed'],
    'src/works/localProfile.test.js': [1, 'quotes the message the slim install printed'],
    'src/works/works.js': [1, 'links already printed with the old name still work'],
    'vite.config.js': [1, 'quotes the message the slim install printed'],
    'src/raw/director/DirectorPanel.jsx': [1, 'how the timeline used to fail on the hosted site'],
    'src/timeline/timingOverlay.js': [1, 'how the timeline used to fail on the hosted site']
}

const counts = () => {
    let out = ''
    try {
        out = execFileSync('git', ['grep', '-I', '-o', '-E', OLD], { cwd: repoDir, encoding: 'utf8', maxBuffer: 64 << 20 })
    } catch (err) {
        if (err.status === 1) return {} // git grep: no match
        throw err
    }
    const byFile = {}
    for (const row of out.split('\n').filter(Boolean)) {
        const file = row.slice(0, row.lastIndexOf(':'))
        byFile[file] = (byFile[file] || 0) + 1
    }
    return byFile
}

const isHistory = (file) => HISTORY.some((h) => (h.endsWith('/') || h.endsWith('-') ? file.startsWith(h) : file === h))

describe('the old address di-studio.xyz', () => {
    const found = counts()
    const live = Object.entries(found).filter(([file]) => !isHistory(file))

    it('appears on no live surface beyond its allowlist', () => {
        const over = live
            .filter(([file, n]) => n > (ALLOWED[file]?.[0] ?? 0))
            .map(([file, n]) => `${file}: ${n} (allowed ${ALLOWED[file]?.[0] ?? 0}) — write diiii.xyz`)
        expect(over).toEqual([])
    })

    it('keeps no allowlist row larger than what the file still holds', () => {
        const stale = Object.entries(ALLOWED)
            .filter(([file, [n]]) => (found[file] || 0) < n)
            .map(([file, [n]]) => `${file}: allowed ${n}, holds ${found[file] || 0} — lower the row`)
        expect(stale).toEqual([])
    })
})
