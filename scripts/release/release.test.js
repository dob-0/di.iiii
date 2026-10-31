// @vitest-environment node
// The release gate, the hot swap and the rollback drill (audit 2026-11-01, slice S10: gaps G05 and G27).
// Every step runs the real commands (record.mjs, show/install.mjs, show/hot-swap.mjs, restore.mjs, drill.mjs and
// target.py) against a fixture git repo with a local bare remote and a replica DI home in a temp folder: no network,
// no server, no show machine.
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { versionLabel } from '../di/overlays.mjs'
import { PREDICATE_TYPE, STATEMENT_TYPE, evaluateGate, parseReview, parseTestSummary, readJsonl, sha256File, validateRecord } from './lib.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const REPO = path.resolve(HERE, '..', '..')
const NODE = process.execPath
const SLOW = 120_000
let T
let repo
let home
const c = {}
const packs = {}
const reviews = {}

const env = (extra = {}) => ({
    ...process.env,
    DI_SHOW_DIR: path.join(T, 'show'),
    DI_RELEASE_DIR: path.join(T, 'release'),
    DI_SHOW_UPDATE_CMD: `${NODE} ${path.join(HERE, 'replica-update.mjs')} --home {home} --from {pack}`,
    DI_SESSION: 'release.test',
    DI_SHOW_CHECKPOINT_CMD: '',
    DI_SHOW_GO_CMD: '',
    DI_SHOW_SERVER: '',
    DI_SHOW_PRODUCTION: '',
    DI_SHOW_UP_CMD: '',
    ...extra
})
const run = (script, args, extra = {}) => {
    const r = spawnSync(NODE, [path.join(REPO, script), ...args], { encoding: 'utf8', env: env(extra), timeout: SLOW })
    return { code: r.status, out: `${r.stdout}${r.stderr}` }
}
const sh = (cmd, cwd = T) => {
    const r = spawnSync('bash', ['-c', cmd], { cwd, encoding: 'utf8' })
    if (r.status !== 0) throw new Error(`${cmd}\n${r.stderr}`)
    return r.stdout.trim()
}
const git = (cmd) => sh(`git -c user.name=t -c user.email=t@t.invalid -c commit.gpgsign=false -c core.hooksPath=/dev/null ${cmd}`, repo)
const commitFile = (name) => {
    fs.writeFileSync(path.join(repo, name), `${name}\n`)
    git(`add ${name}`)
    git(`commit -q -m ${name}`)
    return git('rev-parse HEAD')
}
const makePack = (version, files, release = null) => {
    const top = `di-runtime-${version}`
    const stage = fs.mkdtempSync(path.join(T, 'stage-'))
    for (const [rel, content] of Object.entries(files)) {
        const f = path.join(stage, top, rel)
        fs.mkdirSync(path.dirname(f), { recursive: true })
        fs.writeFileSync(f, content)
    }
    if (release) fs.writeFileSync(path.join(stage, top, 'release.json'), JSON.stringify(release))
    const out = path.join(T, 'packs', `${top}.tar.gz`)
    fs.mkdirSync(path.dirname(out), { recursive: true })
    sh(`tar -czf '${out}' -C '${stage}' '${top}'`)
    return out
}
const ui = (css) => ({
    'serverXR/src/showDesk/ui/show.css': css,
    'serverXR/src/laser/ui/laser.js': 'laser 1',
    'serverXR/src/lighting/ui/light.js': 'light 1'
})
const testsAt = (commit, line = ' Tests  3 passed (3)', code = 0) => {
    git(`checkout -q ${commit}`)
    return run('scripts/release/record.mjs', ['tests', '--repo', repo, '--', 'bash', '-c', `echo '${line}'; exit ${code}`])
}
const record = (pack, extra = []) => run('scripts/release/record.mjs', ['pack', pack, '--repo', repo, ...extra])
const swap = (pack, extra = [], envExtra = {}) => run('scripts/show/hot-swap.mjs', [pack, '--production', 'test-show', '--home', home, ...extra], envExtra)
const undo = () => run('scripts/show/hot-swap.mjs', ['--undo', '--production', 'test-show', '--home', home])
const installs = () => readJsonl(path.join(T, 'show', 'test-show', 'installs.log'))
const live = () => fs.realpathSync(path.join(home, 'current'))
const css = () => fs.readFileSync(path.join(live(), 'serverXR/src/showDesk/ui/show.css'), 'utf8')
const short = (sha) => sha.slice(0, 8)

beforeAll(() => {
    T = fs.mkdtempSync(path.join(os.tmpdir(), 'di-release-test-'))
    repo = path.join(T, 'repo')
    home = path.join(T, 'replica-home')
    sh(`git init -q --bare '${T}/origin.git'`)
    sh(`git init -q '${repo}'`)
    git('checkout -q -b work')
    c.base = commitFile('base.txt')
    c.one = commitFile('one.txt')
    c.two = commitFile('two.txt')
    git(`remote add origin '${T}/origin.git'`)
    git('push -q origin work')
    c.local = commitFile('local.txt') // never pushed
    packs.base = makePack('1.0.0-t.base', { ...ui('css 0'), 'serverXR/src/server.js': 'engine 1', 'shared/laserShapes.cjs': 'shapes 1' },
        { version: '1.0.0-t.base', gitCommit: c.base, packedAt: '2026-11-01T00:00:00.000Z' })
    packs.one = makePack(`1.0.0-look.${short(c.one)}`, ui('css 1'))
    packs.two = makePack(`1.0.0-look.${short(c.two)}`, {
        'serverXR/src/showDesk/ui/show.css': 'css 2', 'serverXR/src/laser/ui/laser.js': 'laser 2', 'serverXR/src/lighting/ui/light2.js': 'light 2'
    })
    packs.local = makePack(`1.0.0-look.${short(c.local)}`, ui('css local'))
    packs.shared = makePack('1.0.0-t.shared', { ...ui('css s'), 'serverXR/src/server.js': 'engine 1', 'shared/laserShapes.cjs': 'shapes CHANGED' },
        { version: '1.0.0-t.shared', gitCommit: c.one })
    reviews.block = path.join(T, 'review-block.md')
    fs.writeFileSync(reviews.block, '# Review\n\n## Verdict\n\nBLOCK on two must-fix items: M1 (a behaviour) and M2 (one line of text). Everything else holds.\nM1 is a change in show.css.\n\n## What I checked\n- M3 is a note, not a must-fix\n')
    reviews.pass = path.join(T, 'review-pass.md')
    fs.writeFileSync(reviews.pass, '# Review\n\n## Verdict\n\nPASS: nothing left to fix.\n')
}, 60_000)

afterAll(() => { if (T) fs.rmSync(T, { recursive: true, force: true }) })

describe('release record and gate', () => {
    it('reads "Tests N passed" (failed counted, "Test Files" ignored) and a review verdict with its open must-fix ids', () => {
        expect(parseTestSummary('\x1b[2m Test Files \x1b[22m 1 passed (1)\n\x1b[2m      Tests \x1b[22m 61 passed (61)\n')).toMatchObject({ passed: 61, failed: 0 })
        expect(parseTestSummary(' Tests  2 failed | 59 passed (61)')).toMatchObject({ passed: 59, failed: 2 })
        expect(parseTestSummary('Test Files  1 passed (1)')).toBe(null)
        expect(parseReview(fs.readFileSync(reviews.block, 'utf8'))).toMatchObject({ verdict: 'BLOCK', mustFixOpen: ['M1', 'M2'] })
        expect(parseReview(fs.readFileSync(reviews.pass, 'utf8'))).toMatchObject({ verdict: 'PASS', mustFixOpen: [] })
        expect(parseReview('no verdict here').verdict).toBe('UNKNOWN')
    })

    it('writes an in-toto Statement bound to the pack sha256, self-attested; a green, pushed, reviewed build passes', () => {
        expect(testsAt(c.one).code).toBe(0)
        const r = record(packs.one, ['--commit', c.one, '--review', reviews.pass])
        expect(r.code, r.out).toBe(0)
        const rec = JSON.parse(fs.readFileSync(`${packs.one}.release.json`, 'utf8'))
        expect(rec._type).toBe(STATEMENT_TYPE)
        expect(rec.predicateType).toBe(PREDICATE_TYPE)
        expect(rec.subject[0].digest.sha256).toBe(sha256File(packs.one))
        expect(rec.predicate).toMatchObject({
            attestation: 'self-attested', commit: c.one, commitFrom: '--commit', pack: { kind: 'ui-only' },
            tests: { passed: 3, failed: 0, commit: c.one, clean: true, exitCode: 0 }, review: { verdict: 'PASS' }, remote: { onRemote: true }
        })
        const g = evaluateGate({ pack: packs.one, action: 'hot-swap' })
        expect(g.decision).toBe('pass')
        expect(g.lines).toHaveLength(3)
        expect(g.lines[0]).toMatch(/self-attested/)
        expect(g.lines[1]).toMatch(/Tests 3 passed/)
    }, SLOW)

    it('refuses a BLOCKed build (exit 4, logged); --accept installs it and logs the reason', () => {
        expect(testsAt(c.base).code).toBe(0)
        expect(record(packs.base, ['--review', reviews.block]).code).toBe(0)
        let r = run('scripts/show/install.mjs', [packs.base, '--production', 'test-show', '--home', home])
        expect(r.code, r.out).toBe(4)
        expect(r.out.split('\n')[0]).toMatch(/^release {2}di-runtime-1\.0\.0-t\.base\.tar\.gz/)
        expect(r.out).toMatch(/GATE REFUSED: review BLOCK \(open must-fix M1, M2\)/)
        expect(fs.existsSync(path.join(home, 'current'))).toBe(false)
        r = run('scripts/show/install.mjs', [packs.base, '--production', 'test-show', '--home', home, '--accept', 'rehearsal base, M1 and M2 are in the ui only'])
        expect(r.code, r.out).toBe(0)
        expect(versionLabel(home).label).toBe('1.0.0-t.base')
        const [refused, accepted] = installs().slice(-2)
        expect(refused).toMatchObject({ action: 'install', decision: 'refused', outcome: 'refused' })
        expect(accepted).toMatchObject({ action: 'install', decision: 'accepted', outcome: 'installed', accept: 'rehearsal base, M1 and M2 are in the ui only' })
    }, SLOW)

    it('refuses an untested build and a commit that is on no remote', () => {
        expect(record(packs.two, ['--commit', c.two, '--review', reviews.pass]).code).toBe(0) // no test run on c.two yet
        let r = swap(packs.two)
        expect(r.code, r.out).toBe(4)
        expect(r.out).toMatch(/untested: no test run on this commit/)
        expect(testsAt(c.local).code).toBe(0)
        expect(record(packs.local, ['--commit', c.local, '--review', reviews.pass]).code).toBe(0)
        r = swap(packs.local)
        expect(r.code, r.out).toBe(4)
        expect(r.out).toMatch(new RegExp(`commit ${short(c.local)} is on no origin branch`))
        expect(r.out).toMatch(/NOT on origin/)
    }, SLOW)

    it('refuses a record made for another pack and a record with an unknown field', () => {
        const other = evaluateGate({ pack: packs.two, recordFile: `${packs.one}.release.json`, action: 'hot-swap' })
        expect(other.decision).toBe('refused')
        expect(other.soft[0]).toMatch(/the record is for another pack/)
        const rec = JSON.parse(fs.readFileSync(`${packs.one}.release.json`, 'utf8'))
        expect(validateRecord(rec, sha256File(packs.one))).toEqual([])
        expect(validateRecord({ ...rec, predicate: { ...rec.predicate, approvedBy: 'someone' } }, sha256File(packs.one))).toEqual(['unknown predicate field(s): approvedBy'])
        const { tests, ...noTests } = rec.predicate
        expect(validateRecord({ ...rec, predicate: noTests }, sha256File(packs.one))[0]).toMatch(/missing predicate field\(s\): tests/)
    })
})

describe('hot swap, undo, restore', () => {
    it('two hot swaps: `di version` shows both overlays, PATCHES only grows, the live path never moves, N-1 is kept', () => {
        expect(testsAt(c.two).code).toBe(0)
        expect(record(packs.two, ['--commit', c.two, '--review', reviews.pass]).code).toBe(0)
        const livePath = live()
        let r = swap(packs.one)
        expect(r.code, r.out).toBe(0)
        const p1 = fs.readFileSync(path.join(livePath, 'PATCHES'))
        r = swap(packs.two)
        expect(r.code, r.out).toBe(0)
        const p2 = fs.readFileSync(path.join(livePath, 'PATCHES'))
        expect(p2.subarray(0, p1.length).equals(p1)).toBe(true)
        expect(p2.toString().trim().split('\n')).toHaveLength(2)
        expect(live()).toBe(livePath)
        const want = `1.0.0-t.base+ui.${short(c.one)}+ui.${short(c.two)}`
        expect(versionLabel(home).label).toBe(want)
        const cli = spawnSync(NODE, [path.join(REPO, 'scripts/di/cli.mjs'), 'version'], { encoding: 'utf8', env: env({ DI_HOME: home }) })
        expect(cli.stdout.trim()).toBe(want)
        const json = spawnSync(NODE, [path.join(REPO, 'scripts/di/cli.mjs'), 'version', '--json'], { encoding: 'utf8', env: env({ DI_HOME: home }) })
        expect(JSON.parse(json.stdout).overlays.map((o) => o.id)).toEqual([`ui.${short(c.one)}`, `ui.${short(c.two)}`])
        expect(spawnSync('python3', ['-I', path.join(HERE, 'target.py'), 'label', home], { encoding: 'utf8' }).stdout.trim()).toBe(want)
        expect(css()).toBe('css 2')
        expect(fs.existsSync(path.join(livePath, 'serverXR/src/lighting/ui/light.js'))).toBe(false)
        const befores = fs.readdirSync(path.join(home, 'versions')).filter((n) => n.includes('.before-'))
        expect(befores).toHaveLength(2)
        const n1 = path.join(home, 'versions', befores.find((n) => n.includes(`.before-ui.${short(c.two)}`)))
        expect(fs.readFileSync(path.join(n1, 'PATCHES')).equals(p1)).toBe(true)
        expect(fs.readFileSync(path.join(n1, 'serverXR/src/lighting/ui/light.js'), 'utf8')).toBe('light 1')
        expect(installs().at(-1)).toMatchObject({ action: 'hot-swap', decision: 'pass', outcome: 'applied', label: want })
    }, SLOW)

    it('undo goes back to N-1 and keeps the undone release', () => {
        const r = undo()
        expect(r.code, r.out).toBe(0)
        expect(versionLabel(home).label).toBe(`1.0.0-t.base+ui.${short(c.one)}`)
        expect(css()).toBe('css 1')
        expect(fs.readdirSync(path.join(home, 'versions')).some((n) => n.includes(`.undone-ui.${short(c.two)}`))).toBe(true)
    }, SLOW)

    it('restore re-applies the pack and its overlays from the manifest, checked by the label', () => {
        expect(swap(packs.two).code).toBe(0)
        const kept = path.join(T, 'checkpoint-manifest.json')
        fs.copyFileSync(path.join(home, 'release-manifest.json'), kept)
        const m = JSON.parse(fs.readFileSync(kept, 'utf8'))
        expect(m.base).toMatchObject({ version: '1.0.0-t.base', pack: 'packs/di-runtime-1.0.0-t.base.tar.gz' })
        expect(m.overlays.map((o) => o.id)).toEqual([`ui.${short(c.one)}`, `ui.${short(c.two)}`])
        expect(undo().code).toBe(0)
        expect(undo().code).toBe(0)
        expect(versionLabel(home).label).toBe('1.0.0-t.base')
        const r = run('scripts/release/restore.mjs', ['--manifest', kept, '--production', 'test-show', '--home', home])
        expect(r.code, r.out).toBe(0)
        expect(versionLabel(home).label).toBe(m.label)
        expect(css()).toBe('css 2')
    }, SLOW)
})

describe('show live: the freeze', () => {
    it('no full install even with --accept; an overlay needs green tests, a checkpoint first and a GO soak after', () => {
        expect(run('scripts/release/show-live.mjs', ['on', '--production', 'test-show', '--why', 'doors open (test)']).code).toBe(0)
        let r = run('scripts/show/install.mjs', [packs.base, '--production', 'test-show', '--home', home, '--accept', 'try it anyway'])
        expect(r.code, r.out).toBe(4)
        expect(r.out).toMatch(/the show is live: a full install \(engine, config\) waits for the end of the show/)
        expect(testsAt(c.local, ' Tests  1 failed | 2 passed (3)', 1).code).toBe(1)
        expect(record(packs.local, ['--commit', c.local]).code).toBe(0)
        r = swap(packs.local, ['--accept', 'try it anyway', '--checkpoint-cmd', 'true', '--go-cmd', 'true'])
        expect(r.code, r.out).toBe(4)
        expect(r.out).toMatch(/the show is live: an overlay needs green tests on the exact commit/)
        r = swap(packs.one)
        expect(r.code, r.out).toBe(4)
        expect(r.out).toMatch(/the show is live: a checkpoint first/)
        const before = versionLabel(home).label
        r = swap(packs.one, ['--checkpoint-cmd', `echo "$DI_SHOW_WHY" > '${T}/checkpoint.txt'`, '--go-cmd', 'true', '--soak', '0.3'])
        expect(r.code, r.out).toBe(0)
        expect(r.out).toMatch(/GO held for 0\.3 s/)
        expect(fs.readFileSync(path.join(T, 'checkpoint.txt'), 'utf8')).toMatch(/hot swap di-runtime-1\.0\.0-look/)
        expect(versionLabel(home).label).toBe(`${before}+ui.${short(c.one)}`)
    }, SLOW)

    it('a NO-GO in the soak undoes the overlay at once (exit 8)', () => {
        const before = versionLabel(home).label
        const r = swap(packs.two, ['--checkpoint-cmd', 'true', '--go-cmd', 'false', '--soak', '0'])
        expect(r.code, r.out).toBe(8)
        expect(versionLabel(home).label).toBe(before)
        expect(installs().at(-1)).toMatchObject({ outcome: 'soak-failed-undone', label: before })
        expect(run('scripts/release/show-live.mjs', ['off', '--production', 'test-show', '--why', 'get-out (test)']).code).toBe(0)
    }, SLOW)

    it('--when-up runs the gate again at the moment the target answers', () => {
        const flag = path.join(T, 'answered-once')
        const upCmd = `[ -f '${flag}' ] && exit 0; touch '${flag}'; '${NODE}' '${path.join(HERE, 'show-live.mjs')}' on --production test-show --why 'live while it waited' >/dev/null; exit 1`
        const r = swap(packs.local, ['--when-up', '--accept', 'rehearsal take'], { DI_SHOW_UP_CMD: upCmd, DI_SHOW_UP_EVERY: '0.1' })
        expect(r.code, r.out).toBe(4)
        expect(r.out).toMatch(/GATE ACCEPTED by --accept "rehearsal take"/)
        expect(r.out).toMatch(/re-checked at the moment it fires/)
        const [start, fire] = installs().slice(-2)
        expect(start).toMatchObject({ phase: 'start', decision: 'accepted', outcome: 'waiting for the target' })
        expect(fire).toMatchObject({ phase: 'fire', decision: 'refused', outcome: 'refused' })
        expect(run('scripts/release/show-live.mjs', ['off', '--production', 'test-show', '--why', 'test over']).code).toBe(0)
    }, SLOW)

    it('a hot swap refuses a pack that changes shared/ files the running server has loaded', () => {
        expect(testsAt(c.one).code).toBe(0)
        expect(record(packs.shared, ['--review', reviews.pass]).code).toBe(0)
        const r = swap(packs.shared, ['--accept', 'try it anyway'])
        expect(r.code, r.out).toBe(4)
        expect(r.out).toMatch(/changes 1 shared\/ file\(s\) the running server has loaded \(shared\/laserShapes\.cjs\)/)
    }, SLOW)

    it('needs a production name and never takes one by default', () => {
        expect(run('scripts/show/install.mjs', [packs.base, '--home', home]).code).toBe(2)
        expect(run('scripts/show/install.mjs', [packs.base, '--production', '../x', '--home', home]).code).toBe(2)
    })
})

describe('rollback drill', () => {
    it('runs N -> N-1 -> N on a replica, checks each label and writes its times', () => {
        const r = run('scripts/release/drill.mjs', ['--home', path.join(T, 'drill-replica'), '--production', 'test-show', '--base', packs.base, '--overlay', packs.one])
        expect(r.code, r.out).toBe(0)
        const d = readJsonl(path.join(T, 'show', 'test-show', 'drills.log')).at(-1)
        expect(d.ok).toBe(true)
        expect(d.steps.map((s) => s.name)).toEqual(['install base (N-1)', 'hot swap overlay (N)', 'rollback N -> N-1', 'forward N-1 -> N', 'restore from the manifest'])
        expect(d.steps.every((s) => s.ok && Number.isInteger(s.ms) && s.ms >= 0)).toBe(true)
        expect(d.steps[2].label).toBe('1.0.0-t.base')
        expect(d.steps[3].label).toMatch(/^1\.0\.0-t\.base\+ui\.[0-9a-f]{8}$/)
    }, SLOW)
})
