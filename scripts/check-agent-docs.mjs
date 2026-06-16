import fs from 'node:fs/promises'
import path from 'node:path'

import {
  AI_DOC_SCOPES,
  REQUIRED_AI_DOC_FILES,
  getGeneratedEntries,
  repoRoot
} from './sync-agent-docs.mjs'

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

const ensureContains = (content, needle, filePath, errors) => {
  if (!content.includes(needle)) {
    errors.push(`${filePath} is missing required reference: ${needle}`)
  }
}

const main = async () => {
  const errors = []

  for (const relativePath of requiredCanonicalFiles) {
    if (!await exists(relativePath)) {
      errors.push(`Missing required canonical file: ${relativePath}`)
    }
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
