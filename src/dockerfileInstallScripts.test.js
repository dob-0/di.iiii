import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// `npm ci` runs the package's own lifecycle scripts (preinstall, install, postinstall,
// prepare). A Dockerfile that copies only package.json + the lock before `npm ci`
// must also copy every file those scripts run, or the image build dies with
// "Cannot find module". That broke every dev deploy from 2026-09-28 20:28 to
// 2026-09-29: "prepare": "node scripts/install-git-hooks.mjs" met an image that had
// no scripts/ yet.

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const LIFECYCLE = ['preinstall', 'install', 'postinstall', 'prepare']

// Files a lifecycle command runs: `node <file>` (flags skipped).
export const filesRunBy = (command = '') => {
  const files = []
  for (const part of String(command).split(/&&|\|\||;/)) {
    const words = part.trim().split(/\s+/)
    if (words[0] !== 'node') continue
    const file = words.slice(1).find((w) => !w.startsWith('-'))
    if (file) files.push(file.replace(/^\.\//, ''))
  }
  return files
}

// The paths copied into the build context before the first `RUN npm ci` of each stage.
export const copiedBeforeNpmCi = (dockerfile) => {
  const found = []
  let copied = []
  for (const raw of dockerfile.split('\n')) {
    const line = raw.trim()
    if (/^FROM\s/i.test(line)) copied = []
    const copy = line.match(/^COPY\s+(?!--from)(.+)$/i)
    if (copy) {
      const args = copy[1].split(/\s+/).filter((w) => !w.startsWith('--'))
      copied.push(...args.slice(0, -1).map((p) => p.replace(/^\.\//, '')))
    }
    if (/^RUN\s+npm ci\b/i.test(line) && !/--ignore-scripts/.test(line)) found.push([...copied])
  }
  return found
}

const covers = (copied, file) => copied.some((p) => p === '.' || p === file || file.startsWith(p.replace(/\/?$/, '/')))

describe('Dockerfiles give npm ci every file its install scripts run', () => {
  it('reads the prepare script of this repo', () => {
    expect(filesRunBy('node scripts/install-git-hooks.mjs')).toEqual(['scripts/install-git-hooks.mjs'])
    expect(filesRunBy('echo hi && node --no-warnings ./a/b.mjs')).toEqual(['a/b.mjs'])
  })

  it('fails a Dockerfile that runs npm ci before the script exists', () => {
    const [copied] = copiedBeforeNpmCi('FROM node\nCOPY package.json package-lock.json ./\nRUN npm ci\nCOPY . .\n')
    expect(covers(copied, 'scripts/install-git-hooks.mjs')).toBe(false)
  })

  for (const dir of ['.', 'serverXR']) {
    it(`${dir}/Dockerfile`, () => {
      const dockerfile = fs.readFileSync(path.join(ROOT, dir, 'Dockerfile'), 'utf8')
      const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, dir, 'package.json'), 'utf8'))
      const needed = LIFECYCLE.flatMap((name) => filesRunBy(pkg.scripts?.[name]))
      for (const copied of copiedBeforeNpmCi(dockerfile)) {
        for (const file of needed) {
          expect(covers(copied, file), `${dir}/Dockerfile runs npm ci without ${file}`).toBe(true)
        }
      }
    })
  }
})
