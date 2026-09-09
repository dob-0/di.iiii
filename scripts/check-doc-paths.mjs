#!/usr/bin/env node
/**
 * check-doc-paths.mjs — every repo path a document names must exist.
 *
 * Deleting a directory cannot fail a build, a test, or a link check. That is
 * how eight role cards, an executable skill, the ops runbook and the org chart
 * all kept routing people into `src/beta/` for a month after it was deleted —
 * and how a role card kept pointing the XR Creator at a component that had been
 * consolidated away. The docs are instructions; an instruction naming a file
 * that is not there sends a person to build the wrong thing or hand the work
 * back.
 *
 * Scans documents that TELL SOMEONE WHAT TO DO. History is deliberately out of
 * scope: PROGRESS.md, dated audits, known-fixes.md and archived mirrors are
 * records of what was true then, and correcting them would be a lie.
 *
 * Usage: node scripts/check-doc-paths.mjs [--list]
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

const SCAN = [
    'AGENTS.md',
    'README.md',
    'MANIFESTO.md',
    'ONBOARDING.md',
    'CHEATSHEET.md',
    'spaces/README.md',
    'docs/ai/roles',
    'docs/ai/golden_rules.md',
    'docs/ai/vocabulary.md',
    'docs/ai/architecture.md',
    'docs/ai/testing.md',
    'docs/ai/deploy.md',
    'docs/architecture',
    'docs/deploy',
    'docs/team',
    '.github/skills'
]

// Paths inside a fenced code block are usually a command or a sample, and a
// sample may legitimately name a file the reader is about to create. Prose and
// tables are where routing happens, so those are what is checked.
//
// Tracked line by line rather than stripped from the whole text: stripping
// shifts every later line number, and a checker that points at the wrong line
// wastes more time than the stale path it found.
const isFence = (line) => line.trimStart().startsWith('```')

// A repo path: starts at one of our real top-level directories, ends at
// something that looks like a file or a directory. Deliberately narrow — a
// false positive here costs someone a confusing failure.
// The lookbehind matters: `beyond_form/src/HousesModel.jsx` names a file in a
// DIFFERENT repo, and without it the scanner matches at the `src/` and reports
// our repo as missing a file that was never ours.
const PATH_PATTERN = /(?<![\w/.-])((?:src|serverXR|scripts|shared|spaces|public|docs)\/[A-Za-z0-9_.\-/*]+)/g

const IGNORE = [
    /\*/,                       // globs — src/raw/**/*
    /^docs\/research\/mirrors\//,
    /\.\.\./,
    // A URL, not a file: every doc names the API as serverXR/api/... because
    // that is the address, and the route lives in serverXR/src/routes/.
    /^serverXR\/api\//,
    // Deliberately absent from the repo — created at install time, or written
    // by a running server, or the tier's data root.
    /^serverXR\/\.env/,
    /^serverXR\/data\//,
    /^public\/live/,
    // The VENDORED names: these files exist in the downstream repos this doc is
    // teaching people to work in (~/di-spaces and the ops repos), not here.
    // docs/ai/space-sync-vendoring.md explains the arrangement.
    /^scripts\/sync-space(-check)?\.mjs$/,
    /^scripts\/sync-ops\.sh$/,
    /^scripts\/graduate\.sh$/,
    /^scripts\/push-all\.sh$/,
    /^scripts\/di-sync\.mjs$/,
    /^scripts\/audit\//,
    /^scripts\/lib\//,
    // cPanel's "startup file" field, which is relative to the app root named
    // two lines above it — not a path from the repo root.
    /^src\/index\.js$/,
    // Written by `install:export` into a data root; never in the repo.
    /^spaces\/_server-config\.json$/,
    // Deliberately gone — the rule that names it exists to keep it gone.
    /^docs\/promo\//
]

// A document that declares itself historical in its first lines is describing
// what was, and its paths are supposed to be dead.
const DECLARES_ITSELF_HISTORY = /^(?:.*\n){0,8}?.*\b(REMOVED|SUPERSEDED|HISTORY, not the current|ARCHIVED)\b/

// Dated audits and snapshots record what was true on their date.
const HISTORY = /(AUDIT[_-]\d{4}|audit-\d{4}|_\d{4}-\d{2}-\d{2})/

// Only report something that is SHAPED like a path: it carries a file
// extension, or it ends in a slash. Without this the scanner reads ordinary
// English — "scripts/styles", "spaces/projects/content" — as broken files and
// buries the real hits. A bare two-word path like `src/beta` is caught by its
// `src/beta/` siblings on neighbouring lines.
const LOOKS_LIKE_A_PATH = /(\.(?:js|jsx|mjs|cjs|ts|tsx|json|md|css|html|sh|py|yml|yaml|conf|txt|glb|png|svg)$)|\/$/

// A line that says the thing is gone is not a broken reference — it is the
// correction. vocabulary.md's "`src/beta/` does not exist" is the clearest
// case: flagging it would ask someone to un-write the truth.
const SAYS_IT_IS_GONE = /\b(does not exist|no longer exist|deleted|retired|removed|absorbed|was consolidated|historical only|never existed|untracked|gitignored|not in git)\b/i

// A path a document is PROPOSING to create is not a broken reference.
const IS_A_PROPOSAL = /\((?:new|planned|proposed)\b|\bwould (?:be|live|go)\b/i

const collect = (file) => {
    const raw = fs.readFileSync(path.join(ROOT, file), 'utf8')
    if (DECLARES_ITSELF_HISTORY.test(raw)) return []
    const lines = raw.split('\n')
    const found = []
    let inFence = false
    lines.forEach((line, index) => {
        if (isFence(line)) { inFence = !inFence; return }
        if (inFence) return
        for (const match of line.matchAll(PATH_PATTERN)) {
            let candidate = match[1].replace(/[.,;:)\]}`'"]+$/, '')
            if (IGNORE.some(pattern => pattern.test(candidate))) continue
            if (!LOOKS_LIKE_A_PATH.test(candidate)) continue
            if (SAYS_IT_IS_GONE.test(line)) continue
            if (IS_A_PROPOSAL.test(line)) continue
            found.push({ file, line: index + 1, candidate, text: line.trim() })
        }
    })
    return found
}

const walk = (entry) => {
    const full = path.join(ROOT, entry)
    if (!fs.existsSync(full)) return []
    if (fs.statSync(full).isFile()) return (entry.endsWith('.md') && !HISTORY.test(entry)) ? [entry] : []
    if (HISTORY.test(entry)) return []
    return fs.readdirSync(full, { withFileTypes: true }).flatMap((child) => (
        walk(path.join(entry, child.name))
    ))
}

const files = SCAN.flatMap(walk)
const missing = files
    .flatMap(collect)
    .filter(hit => !fs.existsSync(path.join(ROOT, hit.candidate)))

if (process.argv.includes('--list')) {
    console.log(`Scanned ${files.length} document(s).`)
}

if (!missing.length) {
    console.log(`Doc path check passed — ${files.length} documents, every named path exists.`)
    process.exit(0)
}

console.error(`Documents naming paths that do not exist (${missing.length}):\n`)
for (const hit of missing) {
    console.error(`  ${hit.file}:${hit.line}`)
    console.error(`    ${hit.candidate}`)
}
console.error('\nA doc is an instruction. Repoint it at the real path, or delete the line.')
process.exit(1)
