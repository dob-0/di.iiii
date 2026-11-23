// @vitest-environment jsdom
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

// ---- Projector Room 2026-10-31, the look at the final copy: four screen problems, each guarded where jsdom has no layout engine (rules and structure).
const html = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), 'index.html'), 'utf8')
const doc = new DOMParser().parseFromString(html, 'text/html')

describe('the top bar: no text can push the stops', () => {
  it('the pill, Blackout, Release and Disarm all are ONE group at the right end of the show row, and it cannot shrink or wrap', () => {
    const stops = doc.querySelector('.topright > .stops')
    expect(stops, 'no .stops group in the show row').not.toBeNull()
    for (const id of ['safetyPill', 'blackoutBtn', 'releaseBtn', 'disarmBtn']) expect(stops.querySelector('#' + id), id).not.toBeNull()
    expect(declarations('.stops')).toMatch(/flex:\s*none/)
    expect(declarations('.stops')).toMatch(/margin-left:\s*auto/)
    expect(declarations('.topright')).toMatch(/flex-wrap:\s*nowrap/)
  })
  it('the follow status is not in the show row: it sits in the options row, with a basis that may only shrink, and an ellipsis', () => {
    const status = doc.getElementById('followStatus')
    expect(status.closest('.options'), 'the status belongs to the options row').not.toBeNull()
    expect(status.closest('.topright'), 'the status must not be in the show row').toBeNull()
    expect(declarations('.options .followstatus')).toMatch(/flex:\s*0 1 \d+px/)
    expect(declarations('.options .followstatus')).toMatch(/min-width:\s*0/)
    expect(declarations('.options')).toMatch(/flex:\s*1 1 0/) // basis 0: the options row can never wrap the show row down
    expect(declarations('.options')).toMatch(/min-width:\s*0/)
    for (const re of [/overflow:\s*hidden/, /text-overflow:\s*ellipsis/, /white-space:\s*nowrap/]) expect(declarations('.followstatus')).toMatch(re)
  })
})

describe('a look name is never cut by an ellipsis', () => {
  it('.tile .name wraps (normal white-space, anywhere-breaks) and has no ellipsis or nowrap; the row still takes its content height', () => {
    const rule = declarations('.tile .name')
    expect(rule, '.tile .name rule not found').not.toBeNull()
    expect(rule).toMatch(/white-space:\s*normal/)
    expect(rule).toMatch(/overflow-wrap:\s*anywhere/)
    expect(rule).not.toMatch(/text-overflow/)
    expect(rule).not.toMatch(/nowrap/)
    expect(declarations('.tiles')).toMatch(/grid-auto-rows:\s*max-content/)
  })
})

describe('Edit: Follows light scene is dark, square, and sits above Shape', () => {
  it('the select uses the page tokens (field background, text colour, square corners), not the native light-grey control', () => {
    const rule = declarations('#followsScene')
    expect(rule, '#followsScene rule not found').not.toBeNull()
    expect(rule).toMatch(/background:\s*var\(--field\)/)
    expect(rule).toMatch(/color:\s*var\(--text\)/)
    expect(rule).toMatch(/border-radius:\s*0/)
    expect(rule).not.toMatch(/#fff|white|#e|#d|#c|#b|#a/i)
  })
  it('its group comes before the Shape group in the Edit pane', () => {
    const follow = doc.getElementById('followGroup')
    const shape = doc.getElementById('shapes').closest('.group')
    expect(follow.compareDocumentPosition(shape) & 4).toBeTruthy() // DOCUMENT_POSITION_FOLLOWING
  })
})

describe('Setup > Safety speaks plain words', () => {
  it('no setting name (DI_LASER_…) is on the operator\'s page; the two modes have their own lines', () => {
    expect(html).not.toMatch(/DI_LASER_/)
    expect(doc.getElementById('safetySignOff')).not.toBeNull()
    expect(doc.getElementById('safetyDark')).not.toBeNull()
  })
})
