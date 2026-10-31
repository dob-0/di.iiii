// The light desk's scene list, Projector Room 2026-10-31 (the look at the final copy): the laser note ends in an ellipsis with its whole text as a title, and the
// filter box keeps a usable width. jsdom has no layout engine, so the rules and the markup that makes them work are guarded here.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const dir = path.dirname(fileURLToPath(import.meta.url))
const css = fs.readFileSync(path.join(dir, 'style.css'), 'utf8')
const app = fs.readFileSync(path.join(dir, 'app.js'), 'utf8')
// Every top-level rule whose selector is exactly `selector` (at the start of a line), their declarations joined.
const rules = (selector) => {
  const escaped = selector.replace(/[.#]/g, '\\$&')
  return [...css.matchAll(new RegExp(`(?:^|\\n)${escaped}\\s*\\{([^}]*)\\}`, 'g'))].map((m) => m[1]).join(' ')
}

describe('the light desk scene list', () => {
  it('.bankrow .sub is a block, so text-overflow draws its ellipsis (it does nothing on an inline span: the laser note was cut with none)', () => {
    const rule = rules('.bankrow .sub')
    expect(rule).toMatch(/display:\s*block/)
    expect(rule).toMatch(/text-overflow:\s*ellipsis/)
    expect(rule).toMatch(/white-space:\s*nowrap/)
  })
  it('the laser note carries its whole text as a title, on the bank row and on the Touch tile', () => {
    expect(app).toMatch(/const laserNoteOf = .*title="laser: \$\{esc\(n\)\}"/)
    expect(app).toMatch(/const laserTnoteOf = .*title="laser: \$\{esc\(n\)\}"/)
  })
  it('the scene filter takes the first row and the buttons wrap under it (it was squeezed to 42 px in the 230 px column, with Follow off too)', () => {
    expect(rules('#sceneFilter')).toMatch(/flex:\s*1 1 100%/)
    expect(rules('.scenesearch')).toMatch(/flex-wrap:\s*wrap/)
  })
})
