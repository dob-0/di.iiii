// scripts/release/lib.mjs — the release record and the install gate, shared by scripts/release/*.mjs and
// scripts/show/{install,hot-swap}.mjs. Method, sources and limits: scripts/release/README.md.
//
// A release record is an in-toto Statement (https://in-toto.io/Statement/v1) whose subject is the pack's sha256 and
// whose predicate is our own (PREDICATE_TYPE): the commit, the remote branches that hold it, "Tests N passed" with
// its command and commit, the review's verdict and open must-fix ids. It is SELF-ATTESTED: the same lead builds the
// pack and writes the record (close to SLSA Build L1: consistency, not independence). The gate recomputes the
// digest, refuses a record with a missing or unknown field, and refuses a BLOCKed, untested or not-on-a-remote build
// unless `--accept '<reason>'` is given; every attempt is logged, overrides with their reason.
import { spawn, spawnSync } from 'node:child_process'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
export const REPO_ROOT = path.resolve(HERE, '..', '..')
export const TARGET_PY = path.join(HERE, 'target.py')
export const REPLICA_UPDATE = path.join(HERE, 'replica-update.mjs')
export const STATEMENT_TYPE = 'https://in-toto.io/Statement/v1'
export const PREDICATE_TYPE = 'https://diiii.xyz/attestations/release-record/v1'
export const UI_DIRS = ['serverXR/src/showDesk/ui', 'serverXR/src/laser/ui', 'serverXR/src/lighting/ui']
export const EXIT = { ok: 0, usage: 2, sha: 3, refused: 4, down: 5, target: 6, checkpoint: 7, soak: 8, label: 9, soakKept: 10 }
const PREDICATE_KEYS = ['attestation', 'recordedAt', 'recordedBy', 'builtAt', 'pack', 'commit', 'commitFrom', 'remote', 'tests', 'review']
const REQUIRED_KEYS = ['attestation', 'pack', 'commit', 'remote', 'tests', 'review']

export class UsageError extends Error {}

export const isoNow = () => new Date().toISOString()
export const stamp = () => isoNow().replace(/[-:]/g, '').replace('T', '-').replace('.', '-').slice(0, 19)
export const who = () => `${os.userInfo().username}@${os.hostname()}${process.env.DI_SESSION ? ` (${process.env.DI_SESSION})` : ''}`
export const b64 = (value) => Buffer.from(JSON.stringify(value)).toString('base64')
export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
export const say = (line = '') => process.stdout.write(`${line}\n`)

export const parseArgs = (argv, booleans = []) => {
    const flags = {}
    const _ = []
    let rest = null
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i]
        if (a === '--') { rest = argv.slice(i + 1); break }
        if (!a.startsWith('--')) { _.push(a); continue }
        const eq = a.indexOf('=')
        const key = eq > 0 ? a.slice(2, eq) : a.slice(2)
        let value
        if (eq > 0) value = a.slice(eq + 1)
        else if (booleans.includes(key)) value = true
        else {
            value = argv[i + 1]
            if (value === undefined || value.startsWith('--')) throw new UsageError(`--${key} needs a value`)
            i++
        }
        if (key === 'overlay') (flags.overlay ||= []).push(value)
        else flags[key] = value
    }
    return { _, flags, rest }
}

export const sha256Text = (text) => crypto.createHash('sha256').update(text).digest('hex')
export const sha256File = (file) => {
    const hash = crypto.createHash('sha256')
    const fd = fs.openSync(file, 'r')
    const buf = Buffer.alloc(1 << 20)
    try {
        let n
        while ((n = fs.readSync(fd, buf, 0, buf.length, null)) > 0) hash.update(buf.subarray(0, n))
    } finally { fs.closeSync(fd) }
    return hash.digest('hex')
}

export const writeAtomic = (file, text) => {
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(`${file}.partial`, text)
    fs.renameSync(`${file}.partial`, file)
}
export const appendJsonl = (file, entry) => {
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.appendFileSync(file, `${JSON.stringify(entry)}\n`)
}
export const readJsonl = (file) => {
    try { return fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) } catch { return [] }
}

// ---- where things are written (no production in any default: --production is always given)
export const releaseDir = () => process.env.DI_RELEASE_DIR || path.join(os.homedir(), 'di-health', 'release')
export const showDir = () => process.env.DI_SHOW_DIR || path.join(os.homedir(), 'di-health', 'show')
export const productionDir = (production) => {
    if (!/^[a-z0-9][a-z0-9._-]{0,63}$/.test(String(production || '')) || String(production).includes('..')) {
        throw new UsageError('--production <name> is required (lower-case letters, digits, . _ -); there is no default production')
    }
    return path.join(showDir(), production)
}

// ---- "Tests N passed": the last vitest-style summary line (memory feedback_test_gate_must_count: N > 0)
const ANSI = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, 'g')
export const parseTestSummary = (text) => {
    const lines = String(text).replace(ANSI, '').split(/\r?\n/).filter((l) => /^\s*Tests\s+\d/.test(l))
    if (!lines.length) return null
    const line = lines.at(-1).trim().replace(/\s+/g, ' ')
    const count = (word) => Number(new RegExp(`(\\d+) ${word}`).exec(line)?.[1] || 0)
    return { line, passed: count('passed'), failed: count('failed'), skipped: count('skipped'), todo: count('todo') }
}

// ---- a review file: the verdict and the must-fix ids it names (audit S10 verify F1 + F4, 2026-11-01).
// The verdict is the text after "## Verdict:" on the heading line, else the first line of the paragraph under a
// "## Verdict" heading, else a "Verdict:" line. It is BLOCK or PASS only when it starts with a known phrase (whole
// words, markdown stripped, the longest phrase first). Anything else is UNKNOWN, and the gate refuses UNKNOWN: the
// first parser knew 6 + 7 single words and read 45 of our 47 reviews as UNKNOWN, which the gate then passed.
// Must-fix ids, for every verdict: each M<n> in the verdict paragraph, plus a short id (F1, P2) in a sentence that says
// "must-fix". A sentence that says fixed/closed/resolved/addressed, and not "not", "until", "still"…, names none.
const byLength = (phrases) => [...phrases].sort((a, b) => b.length - a.length)
export const BLOCK_PHRASES = byLength(['BLOCK', 'BLOCKED', 'BLOCKING', 'REJECT', 'REJECTED', 'REFUSED', 'NO-GO', 'NO GO', 'FAIL',
    'FAILED', 'FIX', 'NOT READY', 'REQUEST CHANGES', 'REQUESTED CHANGES', 'CHANGES REQUESTED', 'CHANGES NEEDED', 'NEEDS CHANGES',
    'DO NOT MERGE', 'DO NOT SHIP'])
export const PASS_PHRASES = byLength(['PASS', 'PASSED', 'APPROVE', 'APPROVED', 'SHIP', 'GO', 'LGTM'])
const startsWithPhrase = (words, phrases) => phrases.some((p) => words.startsWith(p) && !/[A-Z0-9-]/.test(words.charAt(p.length)))
const verdictWords = (line) => String(line || '').replace(/[*_`>]/g, ' ').replace(/^[\s\-–—•]+/, '').replace(/\s+/g, ' ').trim().toUpperCase()
const VERDICT_HEADING = /^#{1,6}\s*verdict\b/i
const VERDICT_LINE = /^[*_\s]*verdict[*_\s]*[:—–-]\s*/i
const FIXED = /\b(fixed|closed|resolved|addressed)\b/i
const STILL_OPEN = /\b(not|until|unless|before|still|open|needs?|once)\b/i
const mustFixIds = (para) => {
    const ids = []
    for (const sentence of para.join(' ').split(/(?<=[.;!?])\s+/)) {
        if (FIXED.test(sentence) && !STILL_OPEN.test(sentence)) continue
        const named = [...(sentence.match(/\bM\d+\b/g) || []), ...(/must[- ]fix/i.test(sentence) ? sentence.match(/\b[A-Z]{1,2}\d{1,3}\b/g) || [] : [])]
        for (const id of named) if (!ids.includes(id)) ids.push(id)
    }
    return ids
}
export const parseReview = (text) => {
    const lines = String(text).split(/\r?\n/)
    // the lines after line i in its paragraph; skipBlank: the paragraph may begin after blank lines (under a heading)
    const follow = (i, skipBlank) => {
        const out = []
        for (const l of lines.slice(i + 1)) {
            if (/^#{1,6}\s/.test(l.trim())) break
            if (!l.trim()) { if (out.length || !skipBlank) break; continue }
            out.push(l.trim())
        }
        return out
    }
    let para = []
    const start = lines.findIndex((l) => VERDICT_HEADING.test(l.trim()))
    if (start >= 0) {
        const rest = lines[start].trim().replace(VERDICT_HEADING, '')
        const inline = /^[*_\s]*[:—–-]/.test(rest) ? rest.replace(/^[*_\s]*[:—–-]\s*/, '').trim() : ''
        para = inline ? [inline, ...follow(start, true)] : follow(start, true)
    } else {
        const at = lines.findIndex((l) => VERDICT_LINE.test(l))
        if (at >= 0) para = [lines[at].replace(VERDICT_LINE, '').trim(), ...follow(at, false)]
    }
    const first = (para[0] || '').replace(/^[*_`\s]+/, '')
    const words = verdictWords(first)
    const verdict = startsWithPhrase(words, BLOCK_PHRASES) ? 'BLOCK' : startsWithPhrase(words, PASS_PHRASES) ? 'PASS' : 'UNKNOWN'
    return { verdict, verdictLine: first.slice(0, 200), mustFixOpen: mustFixIds(para) }
}
export const reviewOf = (file) => {
    const text = fs.readFileSync(file, 'utf8')
    return { file: path.resolve(file), sha256: sha256Text(text), ...parseReview(text) }
}

// ---- git: the commit and the remote branches that hold it (after a fetch, rule "primary source before claim")
const git = (repo, args) => spawnSync('git', ['-C', repo, ...args], { encoding: 'utf8' })
export const resolveCommit = (repo, ref) => {
    const r = git(repo, ['rev-parse', '--verify', '--quiet', `${ref}^{commit}`])
    return r.status === 0 ? r.stdout.trim() : null
}
export const treeClean = (repo) => {
    const r = git(repo, ['status', '--porcelain'])
    return r.status === 0 && r.stdout.trim() === ''
}
export const remoteContains = (repo, commit, { remote = 'origin', fetch = true } = {}) => {
    let fetched = null
    let fetchError = null
    if (fetch) {
        const f = git(repo, ['fetch', '--quiet', remote])
        fetched = f.status === 0
        if (!fetched) fetchError = (f.stderr || '').trim().split('\n').pop() || `exit ${f.status}`
    }
    const r = git(repo, ['for-each-ref', '--contains', commit, '--format=%(refname:short)', `refs/remotes/${remote}`])
    const refs = r.status === 0 ? r.stdout.split('\n').map((s) => s.trim()).filter((s) => s && s !== remote && !s.endsWith('/HEAD')) : []
    return { remote, onRemote: refs.length > 0, refs: refs.slice(0, 5), refCount: refs.length, fetched, fetchError, checkedAt: isoNow() }
}

// ---- packs
export const packEntries = (pack) => {
    const r = spawnSync('tar', ['-tzf', pack], { encoding: 'utf8', maxBuffer: 512 * 1024 * 1024 })
    if (r.status !== 0) throw new Error(`cannot list ${pack}: ${(r.stderr || '').trim()}`)
    return r.stdout.split('\n').filter(Boolean).map((e) => e.replace(/^\.\//, ''))
}
export const packTop = (entries) => entries[0].split('/')[0]
export const packVersion = (pack) => /^di-runtime-(.+)\.tar\.gz$/.exec(path.basename(pack))?.[1] || null
export const packKind = (entries) => {
    const top = packTop(entries)
    if (entries.includes(`${top}/release.json`)) return 'full'
    const files = entries.filter((e) => !e.endsWith('/'))
    return files.every((f) => UI_DIRS.some((d) => f.startsWith(`${top}/${d}/`))) ? 'ui-only' : 'partial'
}
export const packRelease = (pack, entries) => {
    const name = `${packTop(entries)}/release.json`
    if (!entries.includes(name)) return null
    const r = spawnSync('tar', ['-xzf', pack, '-O', name], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 })
    try { return JSON.parse(r.stdout) } catch { return null }
}

// ---- test runs (written by `record.mjs tests`, read by `record.mjs pack`)
export const testRunsFile = (commit) => path.join(releaseDir(), 'tests', `${commit}.jsonl`)
export const latestTestRun = (commit) => readJsonl(testRunsFile(commit)).at(-1) || null

// ---- the record
export const makeRecord = ({ pack, repo = REPO_ROOT, commit = null, testsRun, reviewFile = null, remote = 'origin', fetch = true }) => {
    const entries = packEntries(pack)
    const inner = packRelease(pack, entries)
    const fromPack = inner?.gitCommit ? (resolveCommit(repo, inner.gitCommit) || inner.gitCommit) : null
    const asked = commit ? resolveCommit(repo, commit) : null
    if (commit && !asked) throw new Error(`--commit ${commit} is not a commit in ${repo}`)
    if (asked && fromPack && asked !== fromPack) {
        throw new Error(`--commit ${asked.slice(0, 8)} differs from the commit written inside the pack (${fromPack.slice(0, 8)})`)
    }
    const full = fromPack || asked
    if (!full) throw new Error('no commit: the pack carries no release.json (a ui-only pack), so give --commit <sha>')
    const run = testsRun === undefined ? latestTestRun(full) : testsRun
    return {
        _type: STATEMENT_TYPE,
        subject: [{ name: path.basename(pack), digest: { sha256: sha256File(pack) } }],
        predicateType: PREDICATE_TYPE,
        predicate: {
            attestation: 'self-attested',
            recordedAt: isoNow(),
            recordedBy: who(),
            builtAt: inner?.packedAt || fs.statSync(pack).mtime.toISOString(),
            pack: { version: packVersion(pack), kind: packKind(entries), entries: entries.length },
            commit: full,
            commitFrom: fromPack ? 'pack release.json' : '--commit',
            remote: remoteContains(repo, full, { remote, fetch }),
            tests: run ? {
                result: run.summary?.line || null,
                passed: run.summary?.passed ?? 0,
                failed: run.summary?.failed ?? 0,
                command: run.command,
                commit: run.commit,
                clean: run.clean,
                exitCode: run.exitCode,
                ranAt: run.ranAt,
                log: run.log || null
            } : null,
            review: reviewFile ? reviewOf(reviewFile) : null
        }
    }
}

export const validateRecord = (record, digest) => {
    if (!record || typeof record !== 'object' || Array.isArray(record)) return ['the record is not a JSON object']
    const problems = []
    const extraTop = Object.keys(record).filter((k) => !['_type', 'subject', 'predicateType', 'predicate'].includes(k))
    if (extraTop.length) problems.push(`unknown field(s) in the record: ${extraTop.join(', ')}`)
    if (record._type !== STATEMENT_TYPE) problems.push(`_type is not ${STATEMENT_TYPE}`)
    if (record.predicateType !== PREDICATE_TYPE) problems.push(`predicateType is not ${PREDICATE_TYPE}`)
    const subject = Array.isArray(record.subject) ? record.subject : []
    if (!subject.some((s) => s?.digest?.sha256 === digest)) {
        problems.push(`the record is for another pack (its sha256 ${String(subject[0]?.digest?.sha256 || 'none').slice(0, 12)}, this pack ${digest.slice(0, 12)})`)
    }
    const p = record.predicate && typeof record.predicate === 'object' ? record.predicate : {}
    const unknown = Object.keys(p).filter((k) => !PREDICATE_KEYS.includes(k))
    if (unknown.length) problems.push(`unknown predicate field(s): ${unknown.join(', ')}`)
    const missing = REQUIRED_KEYS.filter((k) => !(k in p))
    if (missing.length) problems.push(`missing predicate field(s): ${missing.join(', ')}`)
    if (p.attestation !== undefined && p.attestation !== 'self-attested') problems.push('attestation is not "self-attested"')
    if (p.commit !== undefined && !/^[0-9a-f]{40}$/.test(String(p.commit))) problems.push('commit is not a full sha')
    return problems
}

export const recordPathFor = (pack, digest, explicit = null) => {
    if (explicit) return path.resolve(explicit)
    const beside = `${pack}.release.json`
    if (fs.existsSync(beside)) return beside
    const stored = path.join(releaseDir(), 'records', `${digest}.json`)
    return fs.existsSync(stored) ? stored : null
}
export const writeRecord = (record, pack, out = null) => {
    const text = `${JSON.stringify(record, null, 2)}\n`
    const beside = out ? path.resolve(out) : `${pack}.release.json`
    writeAtomic(beside, text)
    const stored = path.join(releaseDir(), 'records', `${record.subject[0].digest.sha256}.json`)
    writeAtomic(stored, text)
    return { beside, stored }
}

// A review re-read at gate time with today's parser: the worse of the recorded and the fresh verdict wins (a file that
// turned BLOCK or unreadable after the record counts; BLOCK > UNKNOWN > PASS), and the open must-fix ids of both stay.
const VERDICT_RANK = { PASS: 0, UNKNOWN: 1, BLOCK: 2 }
const rankOf = (verdict) => VERDICT_RANK[verdict] ?? 1
const reviewNow = (review) => {
    if (!review) return null
    try {
        const text = fs.readFileSync(review.file, 'utf8')
        const fresh = parseReview(text)
        const was = rankOf(review.verdict)
        const now = rankOf(fresh.verdict)
        const ids = [...new Set([...(review.mustFixOpen || []), ...(now >= was ? fresh.mustFixOpen : [])])]
        return { ...review, ...(now > was ? fresh : {}), mustFixOpen: ids, changed: sha256Text(text) !== review.sha256 }
    } catch {
        return { ...review, missingNow: true }
    }
}

const untestedWhy = (t, commit) => {
    if (!t) return 'untested: no test run on this commit (node scripts/release/record.mjs tests -- <command>)'
    if (t.commit !== commit) return `untested: the test run was on ${String(t.commit).slice(0, 8)}, not ${commit.slice(0, 8)}`
    if (!t.clean) return 'untested: the tests ran on a dirty tree'
    if (t.exitCode !== 0 || t.failed > 0) return `tests red: ${t.result || `exit ${t.exitCode}`}`
    return `untested: no "Tests N passed" line with N > 0 (${t.result || 'none'})`
}

const headerLines = ({ pack, digest, p, review }) => {
    const name = path.basename(pack)
    if (!p) {
        return [
            `release  ${name}  sha256 ${digest.slice(0, 12)}  NO VALID RECORD (node scripts/release/record.mjs pack ${name} …)`,
            'tests    unknown: no record',
            'review   unknown: no record'
        ]
    }
    const r = p.remote || {}
    const where = r.onRemote ? `on ${r.refs[0]}${r.refCount > 1 ? ` (+${r.refCount - 1})` : ''}` : `NOT on ${r.remote || 'a remote'}`
    const t = p.tests
    const tests = !t ? 'NONE: no test run on this commit'
        : `${t.failed > 0 || t.exitCode !== 0 ? 'RED ' : ''}${t.result || 'no "Tests N passed" line'} · ${t.command} @ ${String(t.commit).slice(0, 8)}${t.commit !== p.commit ? ' (ANOTHER commit)' : ''}${t.clean ? '' : ' (dirty tree)'}`
    const rev = !review ? 'none recorded'
        : `${review.verdict}${review.verdict === 'UNKNOWN' ? ` ("${review.verdictLine || 'no verdict line'}")` : ''}${review.mustFixOpen?.length ? ` · open must-fix ${review.mustFixOpen.join(', ')}` : ''}${review.changed ? ' (file changed since the record)' : ''} · ${review.file}`
    return [
        `release  ${name}  sha256 ${digest.slice(0, 12)}  commit ${p.commit.slice(0, 8)} ${where}  · self-attested ${String(p.recordedAt || '').slice(0, 16)}`,
        `tests    ${tests}`,
        `review   ${rev}`
    ]
}

/**
 * The gate. `action` is 'install' (a full pack: engine, config, ui) or 'hot-swap' (the ui folders only).
 * Outside a live show every failed check is soft: --accept '<reason>' lets it through, logged.
 * A review must be on the record and read as PASS with no open must-fix: no review, an UNKNOWN verdict (the parser
 * cannot read it) and a PASS that names an open must-fix are refused like a BLOCK (audit S10 verify F1, F2, F4).
 * While the show is live (scripts/release/show-live.mjs) the freeze is hard: no full install; an overlay needs
 * a matching record, green tests on the exact commit, a readable PASS review with no open must-fix, a checkpoint first
 * and a GO soak after.
 * `sharedChanged` is the list of shared/ files the pack changes against the live release (null: not known yet).
 */
export const evaluateGate = ({ pack, recordFile = null, action, live = null, accept = null, sharedChanged = [], freeze = {} }) => {
    const digest = sha256File(pack)
    const where = recordPathFor(pack, digest, recordFile)
    let record = null
    let problems
    if (!where) problems = ['no release record for this pack']
    else {
        try {
            record = JSON.parse(fs.readFileSync(where, 'utf8'))
            problems = validateRecord(record, digest)
        } catch (error) { problems = [`the record ${where} cannot be read (${error.message})`] }
    }
    const p = problems.length ? null : record.predicate
    const t = p?.tests
    const testsGreen = Boolean(t && t.commit === p.commit && t.clean === true && t.exitCode === 0 && t.passed > 0 && t.failed === 0)
    const review = p ? reviewNow(p.review) : null
    const blocked = review?.verdict === 'BLOCK'
    const unread = Boolean(review) && !blocked && review.verdict !== 'PASS'
    const openFix = review && !blocked && !unread ? review.mustFixOpen || [] : []
    const soft = []
    const hard = []
    if (!p) soft.push(`${problems.join('; ')}: untested, remote and review unknown`)
    else {
        if (!testsGreen) soft.push(untestedWhy(t, p.commit))
        if (!review) soft.push('no review recorded (node scripts/release/record.mjs pack <pack> … --review <review.md>)')
        if (blocked) soft.push(`review BLOCK${review.mustFixOpen?.length ? ` (open must-fix ${review.mustFixOpen.join(', ')})` : ''}`)
        if (unread) soft.push(`review verdict not readable ("${review.verdictLine || 'no verdict line'}"): the gate reads PASS or BLOCK words only`)
        if (openFix.length) soft.push(`review PASS with open must-fix ${openFix.join(', ')}`)
        if (!p.remote?.onRemote) soft.push(`commit ${p.commit.slice(0, 8)} is on no ${p.remote?.remote || 'remote'} branch`)
    }
    if (live) {
        if (action === 'install') hard.push('the show is live: a full install (engine, config) waits for the end of the show')
        if (action === 'hot-swap') {
            if (!p) hard.push('the show is live: an overlay needs a release record that matches the pack')
            if (p && !testsGreen) hard.push('the show is live: an overlay needs green tests on the exact commit')
            if (p && !review) hard.push('the show is live: an overlay needs a review on its record')
            if (blocked) hard.push('the show is live: a BLOCKed build never goes in')
            if (unread) hard.push('the show is live: a review the gate cannot read never goes in')
            if (openFix.length) hard.push(`the show is live: a build with open must-fix ${openFix.join(', ')} never goes in`)
            if (!freeze.checkpoint) hard.push('the show is live: a checkpoint first (give --checkpoint-cmd or DI_SHOW_CHECKPOINT_CMD)')
            if (!freeze.go) hard.push('the show is live: a GO soak after (give --go-cmd, DI_SHOW_GO_CMD or --server)')
        }
    }
    if (sharedChanged?.length) {
        hard.push(`the pack changes ${sharedChanged.length} shared/ file(s) the running server has loaded (${sharedChanged.slice(0, 3).join(', ')}): that needs a full install, not a hot swap`)
    }
    const decision = hard.length ? 'refused' : soft.length ? (accept ? 'accepted' : 'refused') : 'pass'
    return {
        decision, hard, soft, digest, record: p ? record : null, recordFile: where, testsGreen, blocked, unread, openFix,
        lines: headerLines({ pack, digest, p, review })
    }
}

export const decisionLine = (g, accept) => {
    if (g.decision === 'pass') return 'GATE PASS'
    if (g.decision === 'accepted') return `GATE ACCEPTED by --accept "${accept}" (logged) over: ${g.soft.join('; ')}`
    const why = [...g.hard, ...g.soft].join('; ')
    return `GATE REFUSED: ${why}${g.hard.length ? '' : ` · to go on anyway: --accept '<reason>' (logged)`}`
}

export const acceptOf = (flags) => {
    if (flags.accept === undefined) return null
    const reason = typeof flags.accept === 'string' ? flags.accept.trim() : ''
    if (reason.length < 3) throw new UsageError("--accept needs the reason in words: --accept '<why this build goes in anyway>'")
    return reason
}

// ---- the show-live flag (the freeze) and the log of every install, swap, undo and restore
export const liveFile = (production) => path.join(productionDir(production), 'LIVE')
export const readLive = (production) => {
    try { return JSON.parse(fs.readFileSync(liveFile(production), 'utf8')) } catch (error) {
        return error.code === 'ENOENT' ? null : { since: null, why: 'the LIVE file cannot be read: treated as live' }
    }
}
export const logAction = (production, entry) => {
    const file = path.join(productionDir(production), 'installs.log')
    appendJsonl(file, { at: isoNow(), who: who(), ...entry })
    return file
}

export const printGate = (g, { accept = null, live = null } = {}) => {
    for (const line of g.lines) say(line)
    if (live) say(`show     LIVE since ${live.since || '?'}${live.why ? ` · ${live.why}` : ''}: the freeze applies`)
    say(decisionLine(g, accept))
}

// ---- the target: a DI home on this machine (a replica, the tests) or a show machine over ssh
export const SSH_OPTS = ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=40', '-o', 'ServerAliveInterval=15', '-o', 'ServerAliveCountMax=4']
const shq = (s) => `'${String(s).replace(/'/g, `'\\''`)}'`
export const targetFrom = (flags) => {
    if (flags.home && flags.host) throw new UsageError('give --home <dir> (this machine) or --host <user@host>, not both')
    if (flags.home) return { kind: 'local', home: path.resolve(flags.home), label: `local ${path.resolve(flags.home)}`, flags: ['--home', path.resolve(flags.home)] }
    if (flags.host) {
        const home = flags['remote-home'] || '~/.di'
        return { kind: 'ssh', host: flags.host, home, label: `${flags.host}:${home}`, flags: ['--host', flags.host] }
    }
    throw new UsageError('the target: --home <a DI home on this machine> or --host <user@host>')
}
export const serverArgs = (target, flags) => {
    const server = flags.server || process.env.DI_SHOW_SERVER
    if (server) return ['--server', server]
    return target.kind === 'ssh' ? ['--server-default'] : []
}

/** Run target.py there. Resolves { code, stdout, stderr }; streams its lines unless quiet. */
export const runTarget = (target, args, { input = null, quiet = false, timeoutMs = 15 * 60 * 1000 } = {}) => new Promise((resolve) => {
    const [sub, ...rest] = args
    let command
    let argv
    if (target.kind === 'local') {
        command = 'python3'
        argv = ['-I', TARGET_PY, sub, target.home, ...rest]
    } else {
        const code = fs.readFileSync(TARGET_PY).toString('base64')
        const remote = `t=$(mktemp) && echo ${code} | base64 -d > "$t" && python3 -I "$t" ${[sub, target.home, ...rest].map(shq).join(' ')}; r=$?; rm -f "$t"; exit $r`
        command = 'ssh'
        argv = [...SSH_OPTS, target.host, remote]
    }
    const child = spawn(command, argv, { stdio: ['pipe', 'pipe', 'pipe'] })
    let stdout = ''
    let stderr = ''
    const timer = setTimeout(() => child.kill('SIGTERM'), timeoutMs)
    child.stdout.on('data', (d) => { stdout += d; if (!quiet) process.stdout.write(d) })
    child.stderr.on('data', (d) => { stderr += d; if (!quiet) process.stderr.write(d) })
    child.on('error', (error) => { stderr += String(error.message) })
    child.on('close', (code) => { clearTimeout(timer); resolve({ code: code ?? 1, stdout, stderr }) })
    child.stdin.on('error', () => {})
    if (input) fs.createReadStream(input).pipe(child.stdin)
    else child.stdin.end()
})

export const runShell = (command, { env = {}, quiet = false } = {}) => new Promise((resolve) => {
    const child = spawn('bash', ['-c', command], { stdio: ['ignore', quiet ? 'ignore' : 'inherit', quiet ? 'ignore' : 'inherit'], env: { ...process.env, ...env } })
    child.on('error', () => resolve(127))
    child.on('close', (code) => resolve(code ?? 1))
})

export const parseShalist = (text) => new Map(String(text).split('\n').filter((l) => l.length > 66).map((l) => [l.slice(66), l.slice(0, 64)]))

const walkFiles = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name)
    return e.isDirectory() ? walkFiles(p) : e.isFile() ? [p] : []
})

/** The ui folders of a pack as a bundle: every file listed in a sha256 manifest; `have` (path -> sha) makes it a delta. */
export const buildBundle = (pack, { have = null } = {}) => {
    const entries = packEntries(pack)
    const top = packTop(entries)
    const dirs = UI_DIRS.filter((d) => entries.some((e) => e.startsWith(`${top}/${d}/`) && !e.endsWith('/')))
    if (!dirs.length) throw new Error(`${path.basename(pack)} carries none of ${UI_DIRS.join(', ')}`)
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'di-ui-bundle-'))
    const x = spawnSync('tar', ['-xzf', pack, '-C', tmp, ...dirs.map((d) => `${top}/${d}`)], { encoding: 'utf8' })
    if (x.status !== 0) throw new Error(`cannot take the ui folders out of the pack: ${x.stderr.trim()}`)
    const root = path.join(tmp, top)
    const files = dirs.flatMap((d) => walkFiles(path.join(root, d)).map((f) => path.relative(root, f))).sort()
    const manifest = `${files.map((f) => `${sha256File(path.join(root, f))}  ${f}`).join('\n')}\n`
    const sha8 = sha256Text(manifest).slice(0, 8)
    const manifestRel = `serverXR/src/.ui-manifest-${sha8}.sha256`
    fs.writeFileSync(path.join(root, manifestRel), manifest)
    const want = parseShalist(manifest)
    const send = have ? files.filter((f) => have.get(f) !== want.get(f)) : files
    const bundle = path.join(tmp, 'ui.tar.gz')
    const t = spawnSync('tar', ['-czf', bundle, '-C', root, ...send, manifestRel], { encoding: 'utf8' })
    if (t.status !== 0) throw new Error(`cannot pack the ui bundle: ${t.stderr.trim()}`)
    return { tmp, bundle, sha8, dirs, files: files.length, sent: send.length }
}

/** shared/ files of the pack that differ from the live release; [] when the pack has none; null if the target did not answer. */
export const sharedChanges = async (pack, target) => {
    const entries = packEntries(pack)
    const top = packTop(entries)
    const shared = entries.filter((e) => e.startsWith(`${top}/shared/`) && !e.endsWith('/'))
    if (!shared.length) return []
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'di-shared-'))
    try {
        spawnSync('tar', ['-xzf', pack, '-C', tmp, `${top}/shared`])
        const there = await runTarget(target, ['shalist', 'shared'], { quiet: true })
        if (there.code !== 0) return null
        const have = parseShalist(there.stdout)
        return shared.map((e) => e.slice(top.length + 1)).filter((rel) => have.get(rel) !== sha256File(path.join(tmp, top, rel)))
    } finally { fs.rmSync(tmp, { recursive: true, force: true }) }
}

/** Wait until the target answers (DI_SHOW_UP_CMD, else ssh for a host, else at once). */
export const waitUp = async (target) => {
    const every = Number(process.env.DI_SHOW_UP_EVERY || 20) * 1000
    const limit = Number(process.env.DI_SHOW_UP_FOR || 5400) * 1000
    const probe = process.env.DI_SHOW_UP_CMD
        || (target.kind === 'ssh' ? `timeout 12 ssh ${SSH_OPTS.join(' ')} -o ConnectTimeout=8 ${shq(target.host)} true` : 'true')
    const t0 = Date.now()
    for (;;) {
        if (await runShell(probe, { quiet: true }) === 0) return true
        if (Date.now() - t0 >= limit) return false
        await sleep(every)
    }
}

/** GO for `seconds`: the GO command (S13's `di show go` once it exists) or the built-in page + laser check. */
export const soak = async (target, { seconds, goCmd = null, server = [] }) => {
    const until = Date.now() + seconds * 1000
    let runs = 0
    for (;;) {
        runs++
        const ok = goCmd ? (await runShell(goCmd)) === 0 : (await runTarget(target, ['check', ...server])).code === 0
        if (!ok) return { ok: false, runs }
        if (Date.now() >= until) return { ok: true, runs }
        await sleep(Math.min(10_000, Math.max(0, until - Date.now())))
    }
}

/** Put a release back exactly as a manifest says: verify every file first, then the base pack, then each overlay in order. */
export const restoreFromManifest = async (target, manifest, { quiet = false } = {}) => {
    const v = await runTarget(target, ['verify', b64(manifest)], { quiet })
    if (v.code !== 0) return { ok: false, code: EXIT.target, why: 'the manifest names files that are not on the target' }
    const base = manifest.base
    const inst = await runTarget(target, ['install', base.pack, base.sha256, base.version], { quiet })
    if (inst.code !== 0) return { ok: false, code: inst.code === 3 ? EXIT.sha : EXIT.target, why: 'the base install failed' }
    for (const o of manifest.overlays || []) {
        const { bundle, bundleSha256, before, ...line } = o
        const r = await runTarget(target, ['apply', stamp(), b64({ ...line, restoredAt: isoNow() }), '--bundle', bundle], { quiet })
        if (r.code !== 0) return { ok: false, code: r.code === 3 ? EXIT.sha : EXIT.target, why: `overlay ${o.id} did not go back in` }
    }
    const label = (await runTarget(target, ['label'], { quiet: true })).stdout.trim()
    const ok = label === manifest.label
    return { ok, code: ok ? EXIT.ok : EXIT.label, label, why: ok ? '' : `the label is ${label}; the manifest says ${manifest.label}` }
}

export const main = (fn) => fn().catch((error) => {
    process.stderr.write(`${error instanceof UsageError ? 'usage: ' : ''}${error.message}\n`)
    process.exitCode = error instanceof UsageError ? EXIT.usage : 1
})
