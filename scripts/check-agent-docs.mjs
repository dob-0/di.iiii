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
