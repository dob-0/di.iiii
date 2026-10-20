// The wordmark and the zoom strip are canvas chrome; the cards are the core.
// Seen on dev (space hayfilm, MOCT Raw page, 2026-10): the di mark and the zoom
// box drew OVER cards. The rule: both chrome layers sit strictly below the
// stage that holds the cards. A card dragged under them covers them.
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const dir = path.dirname(fileURLToPath(import.meta.url))
const css = ['raw.css', 'rawChrome.css'].map((f) => readFileSync(path.join(dir, f), 'utf8')).join('\n')
  .replace(/\/\*[\s\S]*?\*\//g, '')

// z-index of the LAST top-level rule whose selector list is exactly `selector`.
const zOf = (selector) => {
  let z = null
  const re = /([^{}]+)\{([^{}]*)\}/g
  for (const m of css.matchAll(re)) {
    if (m[1].split(',').map((s) => s.trim()).includes(selector)) {
      const d = /(?:^|[;\s])z-index:\s*(-?\d+)/.exec(m[2])
      if (d) z = Number(d[1])
    }
  }
  return z
}

describe('canvas chrome sits behind the cards', () => {
  const stage = zOf('.raw-graph-stage')
  it('the stage that holds the cards has a layer of its own', () => {
    expect(stage).toBeGreaterThanOrEqual(1)
  })
  it('the wordmark is below the cards', () => {
    expect(zOf('.raw-surface-wordmark')).toBeLessThan(stage)
  })
  it('the zoom strip is below the cards', () => {
    expect(zOf('.raw-graph-zoom-controls')).toBeLessThan(stage)
  })
})
