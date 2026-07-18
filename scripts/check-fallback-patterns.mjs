// Greps serverXR/src for the "silent hardcoded fallback" bug class described
// in docs/ai/known-fixes.md: a per-entity identifier (spaceId, scope, tenant,
// projectId) falling back to a hardcoded literal, or being auth-gated by a
// literal string comparison, instead of failing loudly or resolving the real
// value. Coarse and deliberately narrow-scoped (serverXR/src only, backend
// auth/routing surface) — a grep, not a type system. Extend ALLOWLIST below
// for confirmed-legitimate matches rather than loosening the pattern.
//
// Known limitation: this does not scan the frontend (src/studio/, src/project/
// routing code), where the bug this check is modeled on actually shipped
// (getStudioLocationState hardcoding spaceId to 'main' — see
// src/studio/utils/studioRouting.js and its regression test). Frontend
// routing fallbacks are far more common as legitimate UI-display defaults
// (e.g. a subtitle label), which makes a blanket grep there too noisy to be
// useful without a lot more allowlisting. Left as a documented gap rather
// than a source of false-positive noise — docs/ai/known-fixes.md's bug-class
// entry points back here.

import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const scanRoot = path.join(repoRoot, 'serverXR/src')

// [file, line-content-substring] pairs already reviewed and confirmed safe.
// A match here is suppressed; anything else trips the check.
const ALLOWLIST = [
  // OAuth token-response `scope` string — not an identity/access-scope value,
  // just the space-delimited permissions string Google returns; '' is a
  // correct empty-permissions default, not a fallback masking a real scope.
  ['googleOAuth.js', "scope: json.scope || ''"]
]

const FALLBACK_PATTERN = /\b(spaceId|scope|tenant|projectId)\b\s*(\|\||\?\?)\s*['"]/
const LITERAL_COMPARE_PATTERN = /\b(spaceId|scope|tenant|projectId)\b\s*===\s*['"][^'"]+['"]/

const walk = async (dir) => {
  const entries = await fs.readdir(dir, { withFileTypes: true })
  const files = []
  for (const entry of entries) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      files.push(...await walk(full))
    } else if (entry.isFile() && entry.name.endsWith('.js') && !entry.name.endsWith('.test.js')) {
      files.push(full)
    }
  }
  return files
}

const isAllowlisted = (relativePath, lineContent) => (
  ALLOWLIST.some(([file, substring]) => relativePath.endsWith(file) && lineContent.includes(substring))
)

const main = async () => {
  const files = await walk(scanRoot)
  const findings = []

  for (const file of files) {
    const relativePath = path.relative(repoRoot, file).split(path.sep).join('/')
    const content = await fs.readFile(file, 'utf8')
    const lines = content.split('\n')
    lines.forEach((line, index) => {
      const matchesFallback = FALLBACK_PATTERN.test(line)
      const matchesCompare = LITERAL_COMPARE_PATTERN.test(line)
      if (!matchesFallback && !matchesCompare) return
      if (isAllowlisted(relativePath, line)) return
      findings.push({
        file: relativePath,
        line: index + 1,
        content: line.trim(),
        kind: matchesFallback ? 'fallback-to-literal' : 'literal-equality-gate'
      })
    })
  }

  if (findings.length) {
    console.error('Possible "silent hardcoded fallback" bug-class matches (docs/ai/known-fixes.md):\n')
    for (const finding of findings) {
      console.error(`  ${finding.file}:${finding.line} [${finding.kind}]\n    ${finding.content}\n`)
    }
    console.error(
      'If this is a real per-entity identifier fallback/gate, fix it to fail loudly or resolve\n' +
      'the real value instead. If it is a confirmed-legitimate case (e.g. a display default),\n' +
      'add it to ALLOWLIST in scripts/check-fallback-patterns.mjs with a one-line justification.'
    )
    process.exitCode = 1
    return
  }

  console.log('check-fallback-patterns: no matches outside the allowlist.')
}

main()
