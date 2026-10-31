// The laser desk's stylesheet, guarded where a jsdom test cannot look: jsdom has no layout engine, so desk.test.js cannot see
// a row height. 2026-10-31 (Projector Room): the bank's 72 looks drew as 17 px rows instead of 93 px (names cut in half,
// pictures over the next row, all 72 tiles "on screen" so all 72 redrew every 50 ms). .tiles is a grid inside a fixed-height
// pane and .tile has min-height 0, so the implicit auto rows had a base size of 0 and SHARED the pane's free height instead
// of keeping their content height. One property on .tiles fixes it; this test fails on the stylesheet before that line.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const css = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), 'desk.css'), 'utf8')

// The declarations of the top-level rule `selector { … }` (a selector at the start of a line, no nested braces).
const declarations = (selector) => {
  const escaped = selector.replace(/[.#]/g, '\\$&')
  const m = css.match(new RegExp(`(?:^|\\n)${escaped}\\s*\\{([^}]*)\\}`))
  return m ? m[1] : null
}

describe('the Looks bank keeps the height of its rows', () => {
  it('.tiles rows keep their content height: the bank scrolls, it never squeezes', () => {
    const rule = declarations('.tiles')
    expect(rule, '.tiles rule not found in desk.css').not.toBeNull()
    expect(rule).toMatch(/grid-auto-rows:\s*max-content/)
  })
})
