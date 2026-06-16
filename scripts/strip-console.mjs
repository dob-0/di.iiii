#!/usr/bin/env node
// strips all console.log/warn/error lines from src/ (skips test files)
import { readFileSync, writeFileSync, readdirSync, statSync } from 'fs'
import { join, extname } from 'path'

const TARGET = './src'
const EXTS = new Set(['.js', '.jsx'])
const LINE_RE = /^\s*console\.(log|warn|error|debug|info)\s*\(.*$/

let totalFiles = 0, totalLines = 0

function walk(dir) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) { walk(full); continue }
    if (!EXTS.has(extname(full))) continue
    if (full.includes('.test.') || full.includes('.spec.')) continue

    const lines = readFileSync(full, 'utf8').split('\n')
    const cleaned = lines.filter(l => !LINE_RE.test(l))
    const removed = lines.length - cleaned.length
    if (removed > 0) {
      writeFileSync(full, cleaned.join('\n'))
      console.log(`  ${full}: -${removed} lines`)
      totalFiles++
      totalLines += removed
    }
  }
}

console.log('Stripping console statements from src/...')
walk(TARGET)
console.log(`\nDone: ${totalLines} lines removed across ${totalFiles} files`)
