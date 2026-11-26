// The Touch minimap (the small stage map): it is framed to its box once, so a box that changes size (window tiled or
// resized, phone turned, stage folded open) left the rig cut off or a speck. Found on the live desk 2026-11-26 (owner N7040):
// 1536x864 -> 844x390 -> 1536x864 left 33 lights as one 8 px square. jsdom has no layout, so the rules are guarded here;
// the pictures and measured numbers are in the session note of PR #1384 (fix-touch-minimap-2026-11-26).
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const dir = path.dirname(fileURLToPath(import.meta.url))
const css = fs.readFileSync(path.join(dir, 'style.css'), 'utf8')
const app = fs.readFileSync(path.join(dir, 'app.js'), 'utf8')
const fn = (name) => {
  const i = app.indexOf(`function ${name}(`)
  expect(i).toBeGreaterThan(-1)
  return app.slice(i, app.indexOf('\n}\n', i))
}

describe('the Touch minimap keeps the rig framed', () => {
  it('a resize of the Touch box frames the rig again (fitStage), unless the view was moved by hand', () => {
    const body = fn('handleStageResize')
    expect(body).toMatch(/closest\('#touchStage'\)[^\n]*!touchHandView[^\n]*touchRefit = stage/)
    expect(body).toMatch(/if \(touchRefit\) \{ fitStage\(touchRefit\)/)
  })
  it('the hand flag is set by pan, pinch and the zoom buttons and cleared by the fit button', () => {
    expect(fn('zoomAt')).toMatch(/closest\('#touchStage'\)\) touchHandView = true/)
    expect(fn('fitStage')).toMatch(/closest\('#touchStage'\)\) touchHandView = false/)
    expect(app).toMatch(/mode: 'pan'[^\n]*\n\s*touchHandView = true;\n\s*return;/)
  })
  it('the short-window min-heights of the Touch box are not beaten by `.touchwrap .touchstage { min-height: 0 }`', () => {
    // a media rule `.touchstage { min-height: Npx }` (one class) lost to it, so a phone turned sideways got a 25 px stage
    const mins = [...css.matchAll(/\n\s+([^\n{]*\.touchstage[^\n{]*)\{[^}]*min-height:\s*(\d+)px/g)]
    expect(mins.length).toBeGreaterThanOrEqual(3)
    for (const m of mins) expect(m[1]).toMatch(/\.touchwrap \.touchstage:not\(\.folded\)/)
  })
})
