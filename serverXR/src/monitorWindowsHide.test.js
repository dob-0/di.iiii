// @vitest-environment node

// On Windows a child process started without windowsHide gets its own console window, and with Windows Terminal as the default
// terminal that is a visible window outline flashing on screen at every monitor refresh. Every command the monitor runs
// must say windowsHide: true. This reads the sources, so a new execFile/spawn call added without it fails here.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const here = path.dirname(fileURLToPath(import.meta.url))
const CALL = /\b(execFile|execFileSync|spawn|spawnSync)\(/g

describe('monitor commands never open a console window', () => {
  for (const file of fs.readdirSync(here).filter((f) => /^monitor[A-Za-z]*\.js$/.test(f))) {
    it(`${file}: every command call sets windowsHide`, () => {
      const text = fs.readFileSync(path.join(here, file), 'utf8')
      const bad = []
      for (const m of text.matchAll(CALL)) {
        const line = text.slice(0, m.index).split('\n').length
        const lineText = text.split('\n')[line - 1]
        if (/^\s*(\/\/|\*)/.test(lineText) || /require\(/.test(lineText)) continue
        // the options object sits within the call's own line or the next two
        const span = text.split('\n').slice(line - 1, line + 2).join('\n')
        if (!/windowsHide:\s*true/.test(span)) bad.push(`${file}:${line}`)
      }
      expect(bad).toEqual([])
    })
  }
})
