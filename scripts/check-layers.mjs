#!/usr/bin/env node
/**
 * LAYER GUARD — no new personal or private data in this public repo.
 *
 * Reads the ADDED lines of the diff against a base (default origin/dev) and fails (exit 1, file:line) on:
 *   1. a tailnet IPv4 address (the 100.64/10 range) in a non-test file (generic, public rule);
 *   2. any pattern from a private list, kept OUTSIDE this repo: the file named by env
 *      DI_LAYER_DENYLIST, or the text of env LAYER_DENYLIST (a CI secret), one pattern per line
 *      (`#` comments; a plain line is a whole-word, case-insensitive match; `re:<regex>` is a regex).
 * No list set: it says so in one line and runs the generic rule only.
 *
 * A hit prints file:line and the rule's name, never the matched text or the pattern: the CI log of a
 * public repo is public too.
 *
 * Usage: node scripts/check-layers.mjs [--base <ref>] [--repo <dir>]
 */
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import { pathToFileURL } from 'node:url'

const TAILNET_V4 = /(?<![\d.])100\.(?:6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.\d{1,3}\.\d{1,3}(?![\d])/
// test files may carry made-up values (fixtures); everything else may not carry an address
const TEST_FILE = /(?:\.(?:test|spec)\.[cm]?[jt]sx?$|(?:^|\/)(?:__tests__|__fixtures__|fixtures?)\/)/

export const NO_LIST_LINE = 'layer guard: private list not set, generic rules only'

/** Parse the private list text into matchers. */
export const parseDenylist = (text) => String(text || '')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'))
    .map((l) => {
        if (l.startsWith('re:')) return new RegExp(l.slice(3), 'i')
        return new RegExp(`(?<![A-Za-z0-9_])${l.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![A-Za-z0-9_])`, 'i')
    })

/** The added lines of a unified diff (-U0) as { file, line, text }. Deleted files and binary hunks give none. */
export const addedLines = (diff) => {
    const out = []
    let file = null
    let next = 0
    for (const raw of String(diff).split('\n')) {
        if (raw.startsWith('+++ ')) { file = raw.startsWith('+++ b/') ? raw.slice(6) : null; continue }
        if (raw.startsWith('--- ')) continue
        const hunk = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(raw)
        if (hunk) { next = Number(hunk[1]); continue }
        if (file && raw.startsWith('+')) { out.push({ file, line: next, text: raw.slice(1) }); next += 1 }
    }
    return out
}

/** Hits for a list of added lines: { file, line, rule }. */
export const scan = (lines, { denylist = [] } = {}) => {
    const hits = []
    for (const { file, line, text } of lines) {
        if (!TEST_FILE.test(file) && TAILNET_V4.test(text)) hits.push({ file, line, rule: 'tailnet-address' })
        if (denylist.some((re) => re.test(text))) hits.push({ file, line, rule: 'private-list' })
    }
    return hits
}

const readDenylist = (env) => {
    if (env.DI_LAYER_DENYLIST) {
        try { return fs.readFileSync(env.DI_LAYER_DENYLIST, 'utf8') } catch { return null }
    }
    return env.LAYER_DENYLIST || null
}

export const run = ({ argv = process.argv.slice(2), env = process.env, out = (s) => console.log(s), err = (s) => console.error(s) } = {}) => {
    const flag = (name, dflt) => { const i = argv.indexOf(name); return i >= 0 && argv[i + 1] ? argv[i + 1] : dflt }
    const base = flag('--base', 'origin/dev')
    const repo = flag('--repo', process.cwd())
    let diff
    const diffAgainst = (range) => execFileSync('git', ['-C', repo, 'diff', '--unified=0', '--no-color', '--no-ext-diff', range], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] })
    try {
        // the branch's own changes (merge base); a shallow CI checkout may lack the merge base, then base..HEAD
        try { diff = diffAgainst(`${base}...HEAD`) } catch { diff = diffAgainst(`${base}..HEAD`) }
    } catch (e) {
        // never a quiet pass: a base that cannot be read is said, and the check stops the push
        err(`layer guard: cannot diff against ${base} (${String(e.message || e).split('\n')[0]}); fetch it or pass --base`)
        return 2
    }
    const text = readDenylist(env)
    if (env.DI_LAYER_DENYLIST && text === null) { err('layer guard: DI_LAYER_DENYLIST names a file that cannot be read'); return 2 }
    if (!text) out(NO_LIST_LINE)
    const hits = scan(addedLines(diff), { denylist: parseDenylist(text) })
    for (const h of hits) err(`${h.file}:${h.line}  ${h.rule}`)
    if (hits.length) {
        err(`layer guard: ${hits.length} added line(s) carry personal or private data. Make the value generic, or keep it out of this repo.`)
        return 1
    }
    out(`layer guard: ${addedLines(diff).length} added lines checked, no hit`)
    return 0
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) process.exit(run())
