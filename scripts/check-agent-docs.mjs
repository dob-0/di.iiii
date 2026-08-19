import fs from 'node:fs/promises'
import path from 'node:path'
import { execFileSync } from 'node:child_process'

import {
  AI_DOC_SCOPES,
  REQUIRED_AI_DOC_FILES,
  getGeneratedEntries,
  repoRoot
} from './sync-agent-docs.mjs'
import { isNoiseBranch } from './repo-state-lib.mjs'

const normalizePath = (value) => value.split(path.sep).join('/')

const toAbsolute = (relativePath) => path.join(repoRoot, relativePath)

const readFile = async (relativePath) => {
  return fs.readFile(toAbsolute(relativePath), 'utf8')
}

const exists = async (relativePath) => {
  try {
    await fs.access(toAbsolute(relativePath))
    return true
  } catch {
    return false
  }
}

const readSkillFrontmatter = (content) => {
  const match = content.match(/^---\n([\s\S]*?)\n---\n/)
  if (!match) return null
  const fields = {}
  for (const line of match[1].split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const separator = trimmed.indexOf(':')
    if (separator <= 0) continue
    const key = trimmed.slice(0, separator).trim()
    let value = trimmed.slice(separator + 1).trim()
    if ((value.startsWith("'") && value.endsWith("'")) || (value.startsWith('"') && value.endsWith('"'))) {
      value = value.slice(1, -1)
    }
    fields[key] = value
  }
  return fields
}

const REQUIRED_SKILL_SECTIONS = [
  '## When to Use',
  '## Outcome',
  '## Validation',
  '## Completion Checks'
]

const hasOperationalSection = (content) => (
  /^##\s+.*\b(Procedure|Flow|Workflow|Steps)\b/im.test(content)
)

const listSkillFiles = async () => {
  const skillsRoot = toAbsolute('.github/skills')
  try {
    const entries = await fs.readdir(skillsRoot, { withFileTypes: true })
    return entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => normalizePath(path.join('.github/skills', entry.name, 'SKILL.md')))
  } catch {
    return []
  }
}

const canonicalScopeFiles = AI_DOC_SCOPES.map((scope) => (
  scope.dir === '.'
    ? 'AGENTS.md'
    : normalizePath(path.join(scope.dir, 'AGENTS.md'))
))

const requiredCanonicalFiles = [
  'README.md',
  'AGENTS.md',
  ...REQUIRED_AI_DOC_FILES,
  ...canonicalScopeFiles
]

const forbiddenPatterns = [
  /distudio@di-studio\.xyz/i,
  /\/home\/distudio\//i
]

const aiDocFilesForSafetyScan = [
  ...new Set([
    'AGENTS.md',
    ...canonicalScopeFiles,
    ...REQUIRED_AI_DOC_FILES,
    ...getGeneratedEntries().map((entry) => entry.path)
  ])
]

// Live AI-instruction files rot when they pin facts that scripts can derive —
// the 2026-07-07 audit found every hand-written test count and "not in CI"
// claim stale. Flag the known rot patterns; write invariants ("all pass; count
// never decreases") instead of numbers.
const rotScanFiles = [
  'AGENTS.md',
  'CHEATSHEET.md',
  'ONBOARDING.md',
  ...canonicalScopeFiles,
  '.claude/agents',
  '.claude/commands',
  'docs/ai/roles',
  'docs/deploy'
]

const rotPatterns = [
  { re: /\b\d+\s+tests?\b/g, why: 'hardcoded test count (write "all pass; count never decreases" instead)' },
  { re: /\b\d+\s+test files\b/g, why: 'hardcoded test-file count' },
  { re: /not in CI/gi, why: 'stale CI claim (ci.yml runs the full suite incl. contracts + schema-sync)' }
]

// Production deploy moved from cPanel to a Hetzner VPS on 2026-07-15
// (docs/deploy/LIVE_DEPLOY.md is the current deploy truth) — an agent
// session afterward still cited the old workflow/branch names from session
// memory (see docs/ai/golden_rules.md's "verify infra/deploy/tool facts"
// rule). These files are the only place those strings are still expected to
// appear (they document the legacy path on purpose); anywhere else is a
// stale citation.
const legacyDeployPatterns = [
  { re: /publish-cpanel-prebuilt-v2\.yml/g, why: 'legacy cPanel workflow — current deploy is deploy-vps.yml/deploy-vps-staging.yml' },
  { re: /cpanel-staging\b/g, why: 'legacy cPanel artifact branch — current deploy target is the Hetzner VPS' },
  { re: /cpanel-production\b/g, why: 'legacy cPanel artifact branch — current deploy target is the Hetzner VPS' }
]
const legacyDeployAllowlist = new Set([
  'docs/deploy/CPANEL_DEPLOYMENT.md',
  'docs/deploy/CPANEL_PREBUILT_DEPLOY.md',
  'docs/deploy/PUBLISH_WORKFLOW.md',
  'docs/deploy/LIVE_DEPLOY.md',
  'docs/deploy/VPS_DOCKER_DEPLOY.md',
  'deploy/AGENTS.md',
  'docs/ai/roles/infrastructure-engineer.md'
])

const collectRotScanTargets = async () => {
  const targets = []
  for (const entry of rotScanFiles) {
    if (!await exists(entry)) continue
    const stats = await fs.stat(toAbsolute(entry))
    if (stats.isDirectory()) {
      for (const name of await fs.readdir(toAbsolute(entry))) {
        if (name.endsWith('.md')) targets.push(path.posix.join(entry, name))
      }
    } else {
      targets.push(entry)
    }
  }
  return targets
}

const ensureContains = (content, needle, filePath, errors) => {
  if (!content.includes(needle)) {
    errors.push(`${filePath} is missing required reference: ${needle}`)
  }
}

// CURRENT.md says of itself "≤50 lines. Read in full." — and its own limit was
// the one rule in the whole contract that nothing checked. It went over three
// times in a single session on 2026-08-06, each time caught only by a person
// counting. A rule every agent is told to obey and no build can see is a
// convention, not a protocol.
const CURRENT_MD_MAX_LINES = 50

// CURRENT.md was rewritten 22 times on 2026-08-06 from 3 different branches. Two
// commits landed one minute apart with contradictory claims about where `main` was —
// each agent had faithfully transcribed a stale fact from its own worktree. Commit
// SHAs and ahead/behind counts are derived facts; `npm run state` (scripts/repo-state.mjs)
// is the one place they can live without going stale the moment another branch moves.
const currentMdDerivedPatterns = [
  { re: /`[0-9a-f]{7,40}`/g, why: 'commit SHA in CURRENT.md — derived; run `npm run state` instead of transcribing one' },
  { re: /\b\d+\s+(ahead|behind)\b/gi, why: 'branch position in CURRENT.md — derived; run `npm run state` instead of transcribing one' }
]

// If code changed days ago and CURRENT.md didn't, the end-of-session recap was
// skipped. Mirrors collectFreshnessErrors in check-wiki-sync.mjs, including its
// shallow-checkout guard.
const CURRENT_MD_GRACE_DAYS = 2
const CURRENT_MD_FRESHNESS_PATHS = ['src', 'serverXR', 'shared', 'scripts']

const collectCurrentMdFreshnessErrors = () => {
  try {
    const lastCode = execFileSync('git', ['log', '-1', '--format=%cs', '--', ...CURRENT_MD_FRESHNESS_PATHS], { cwd: repoRoot, encoding: 'utf8' }).trim()
    if (!lastCode) return []
    const depth = execFileSync('git', ['rev-list', '--count', 'HEAD'], { cwd: repoRoot, encoding: 'utf8' }).trim()
    if (Number(depth) < 10) return []
    const lastRecap = execFileSync('git', ['log', '-1', '--format=%cs', '--', 'CURRENT.md'], { cwd: repoRoot, encoding: 'utf8' }).trim()
    if (!lastRecap) return []
    const gapDays = Math.floor((new Date(lastCode) - new Date(lastRecap)) / 86_400_000)
    if (gapDays > CURRENT_MD_GRACE_DAYS) {
      return [`CURRENT.md freshness: code last changed ${lastCode} but CURRENT.md was last recapped ${lastRecap} (${gapDays} days behind, grace ${CURRENT_MD_GRACE_DAYS}). Run /recap.`]
    }
  } catch {
    return []
  }
  return []
}

// The session-notes protocol (docs/ai/sessions/, see its README) exists because
// CURRENT.md's "replace, don't append" convention plus concurrent branches raced
// destructively -- three sessions' real notes were silently overwritten before their
// branch merged, recovered afterward only via git fsck --dangling. Fix: CURRENT.md is
// written by exactly one thing (`npm run land`, at merge time); every other branch
// writes to its own append-only file at a path nothing else can collide on.
const slugifyBranch = (branch) => branch.replace(/\//g, '-')

const gitOrNull = (args) => {
  try {
    return execFileSync('git', args, { cwd: repoRoot, encoding: 'utf8' }).trim()
  } catch {
    return null
  }
}

const collectSessionNoteErrors = async () => {
  const branch = gitOrNull(['branch', '--show-current'])
  if (!branch) return [] // detached HEAD -- nothing to attribute a note to

  const sessionsDir = 'docs/ai/sessions'
  let sessionFiles
  try {
    sessionFiles = (await fs.readdir(toAbsolute(sessionsDir)))
      .filter((name) => name.endsWith('.md') && name !== 'README.md')
  } catch {
    sessionFiles = []
  }

  if (branch === 'dev' || branch === 'main') {
    // Landing (npm run land) is what empties this directory -- a non-empty one here
    // means a merge happened without it, which is exactly the un-enforced "courtesy
    // cleanup" this protocol exists to replace.
    return sessionFiles.length
      ? [`${sessionsDir}/ is not empty on "${branch}" (${sessionFiles.join(', ')}) — run \`npm run land\` before pushing.`]
      : []
  }

  if (isNoiseBranch(branch)) return []

  const errors = []
  const expected = `${slugifyBranch(branch)}.md`
  if (!sessionFiles.includes(expected)) {
    errors.push(
      `No session note at ${sessionsDir}/${expected} for branch "${branch}" — add one before ` +
        `pushing (see ${sessionsDir}/README.md). This is what stops a branch's notes from being ` +
        'lost if a concurrent branch rewrites CURRENT.md first.'
    )
  } else {
    const content = await readFile(`${sessionsDir}/${expected}`)
    if (!/^##\s+/m.test(content)) {
      errors.push(`${sessionsDir}/${expected} has no "## " heading — see ${sessionsDir}/README.md for the format.`)
    }
  }

  // CURRENT.md describes dev's state and is written only by `npm run land` -- a
  // feature branch that edits it is pre-writing what it guesses dev will look like,
  // which is the exact race this protocol replaces. Best-effort: only checks when
  // origin/dev is resolvable locally (it may not be on a shallow/stale fetch).
  if (gitOrNull(['rev-parse', '--verify', 'origin/dev'])) {
    // Two-dot, not three-dot: compares the working tree's CURRENT.md against origin/dev's
    // CURRENT tip. `origin/dev...HEAD` would diff from the merge-base instead, which stays
    // "different" for the life of the branch even after reverting back to dev's content.
    const diff = gitOrNull(['diff', '--quiet', 'origin/dev', '--', 'CURRENT.md'])
    if (diff === null) {
      // non-zero exit from --quiet means there IS a diff (gitOrNull returns null on throw)
      errors.push('CURRENT.md differs from origin/dev — only `npm run land` (at merge time) writes this file; revert your branch\'s copy.')
    }
  }

  return errors
}

const main = async () => {
  const errors = []
  errors.push(...(await collectSessionNoteErrors()))

  for (const relativePath of requiredCanonicalFiles) {
    if (!await exists(relativePath)) {
      errors.push(`Missing required canonical file: ${relativePath}`)
    }
  }

  if (await exists('CURRENT.md')) {
    const currentMdContent = await readFile('CURRENT.md')
    const lines = currentMdContent.replace(/\n$/, '').split('\n').length
    if (lines > CURRENT_MD_MAX_LINES) {
      errors.push(`CURRENT.md is ${lines} lines, limit ${CURRENT_MD_MAX_LINES}. It is read in full at the start of every session — cut the settled items or move them to PROGRESS.md.`)
    }

    // CURRENT.md describes dev, unconditionally -- ownership stated once, literally,
    // rather than left implicit (see collectSessionNoteErrors above for the rest of
    // the protocol this backs).
    if (!currentMdContent.includes('active_branch: dev')) {
      errors.push('CURRENT.md must contain the literal line "active_branch: dev" — it always describes dev\'s state now, never a feature branch\'s.')
    }

    for (const line of currentMdContent.split('\n')) {
      for (const { re, why } of currentMdDerivedPatterns) {
        re.lastIndex = 0
        if (re.test(line)) {
          errors.push(`CURRENT.md: "${line.trim().slice(0, 80)}" — ${why}`)
        }
      }
    }

    errors.push(...collectCurrentMdFreshnessErrors())
  }

  for (const entry of getGeneratedEntries()) {
    const expected = entry.content.endsWith('\n') ? entry.content : `${entry.content}\n`
    if (!await exists(entry.path)) {
      errors.push(`Missing generated bridge file: ${entry.path}`)
      continue
    }
    const actual = await readFile(entry.path)
    if (actual !== expected) {
      errors.push(`Generated bridge file is out of sync: ${entry.path}`)
    }
  }

  if (await exists('README.md')) {
    const readme = await readFile('README.md')
    ensureContains(readme, 'AGENTS.md', 'README.md', errors)
    ensureContains(readme, 'docs/ai/index.md', 'README.md', errors)
  }

  if (await exists('AGENTS.md')) {
    const agents = await readFile('AGENTS.md')
    ensureContains(agents, 'docs/ai/index.md', 'AGENTS.md', errors)
  }

  if (await exists('docs/ai/index.md')) {
    const index = await readFile('docs/ai/index.md')
    for (const relativePath of canonicalScopeFiles) {
      ensureContains(index, relativePath, 'docs/ai/index.md', errors)
    }
  }

  const skillFiles = await listSkillFiles()
  const seenSkillNames = new Set()

  for (const skillPath of skillFiles) {
    if (!await exists(skillPath)) {
      errors.push(`Missing generated skill file: ${skillPath}`)
      continue
    }

    const content = await readFile(skillPath)
    for (const pattern of forbiddenPatterns) {
      if (pattern.test(content)) {
        errors.push(`${skillPath} contains a forbidden private-host pattern: ${pattern}`)
      }
    }
    const frontmatter = readSkillFrontmatter(content)
    if (!frontmatter) {
      errors.push(`${skillPath} is missing YAML frontmatter`)
      continue
    }

    for (const requiredField of ['name', 'description', 'argument-hint']) {
      if (!frontmatter[requiredField]?.trim()) {
        errors.push(`${skillPath} is missing required frontmatter field: ${requiredField}`)
      }
    }

    for (const section of REQUIRED_SKILL_SECTIONS) {
      if (!content.includes(section)) {
        errors.push(`${skillPath} is missing required section: ${section}`)
      }
    }

    if (!hasOperationalSection(content)) {
      errors.push(`${skillPath} is missing an operational section (Procedure/Flow/Workflow/Steps)`)
    }

    const expectedName = path.basename(path.dirname(skillPath))
    if (frontmatter.name && frontmatter.name !== expectedName) {
      errors.push(`${skillPath} has mismatched name field: expected "${expectedName}", got "${frontmatter.name}"`)
    }

    if (frontmatter.name) {
      if (seenSkillNames.has(frontmatter.name)) {
        errors.push(`Duplicate skill name found: ${frontmatter.name}`)
      }
      seenSkillNames.add(frontmatter.name)
    }
  }

  for (const relativePath of await collectRotScanTargets()) {
    const content = await readFile(relativePath)
    const isLegacyDeployAllowed = legacyDeployAllowlist.has(relativePath)
    const patterns = isLegacyDeployAllowed ? rotPatterns : [...rotPatterns, ...legacyDeployPatterns]
    for (const line of content.split('\n')) {
      for (const { re, why } of patterns) {
        re.lastIndex = 0
        if (re.test(line)) {
          errors.push(`${relativePath}: "${line.trim().slice(0, 80)}" — ${why}`)
        }
      }
    }
  }

  for (const relativePath of aiDocFilesForSafetyScan) {
    if (!await exists(relativePath)) continue
    const content = await readFile(relativePath)
    for (const pattern of forbiddenPatterns) {
      if (pattern.test(content)) {
        errors.push(`${relativePath} contains a forbidden private-host pattern: ${pattern}`)
      }
    }
  }

  if (errors.length) {
    console.error('AI documentation checks failed:')
    errors.forEach((error) => {
      console.error(`- ${error}`)
    })
    process.exit(1)
  }

  console.log('AI documentation checks passed.')
}

await main()
