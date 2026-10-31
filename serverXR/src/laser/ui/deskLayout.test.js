// @vitest-environment jsdom
// The laser desk's two layouts, guarded where jsdom has no layout engine (rules and structure; the real rectangles were measured in a browser, see the session note).
// 2026-10-31, the owner: "fix the laser desk: the place is not used right, the windows inside are managed not right, it is ugly and not logical".
// Decision: Grid is the new default; CLASSIC IS KEPT WHOLE AS A MODE (nothing we have is ever lost). So this file pins, in this order:
// 1. every Grid rule is under html[data-layout="grid"] inside ONE size query at the end of desk.css; nothing of Classic sits under it or above it with a data-layout in it,
// 2. nothing is lost: every id of Classic's index.html is still there, the .editbody child order the Grid rules count on is pinned, the base rules of the stops are the ones Classic had,
// 3. the signature: no radius but 0, no colour literal (the page's own tokens), no :has() and no aspect-ratio (browser risk), nothing hidden without its words in a title,
// 4. the four fixes of the build (the hint is an ellipsis not a hole, the palette is docked in the strip, the stops stay above the Keys sheet).
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const here = path.dirname(fileURLToPath(import.meta.url))
const css = fs.readFileSync(path.join(here, 'desk.css'), 'utf8')
const doc = new DOMParser().parseFromString(fs.readFileSync(path.join(here, 'index.html'), 'utf8'), 'text/html')

const GRID_QUERY = '@media (min-width: 1240px) and (min-height: 640px)'
const SCOPE = 'html[data-layout="grid"]'
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '')
const blockAt = (text, openAt) => {
  let depth = 0
  for (let i = openAt; i < text.length; i++) {
    if (text[i] === '{') depth++
    else if (text[i] === '}' && --depth === 0) return { body: text.slice(openAt + 1, i), end: i }
  }
  return null
}
const rulesOf = (text) => [...stripComments(text).matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({ selector: m[1].trim().replace(/\s+/g, ' '), declarations: m[2].replace(/\s+/g, ' ').trim() }))

const queryAt = css.indexOf(GRID_QUERY)
const gridBlock = queryAt >= 0 ? blockAt(css, css.indexOf('{', queryAt)) : null
const gridRules = gridBlock ? rulesOf(gridBlock.body) : []
const afterRules = gridBlock ? rulesOf(css.slice(gridBlock.end + 1)) : []
const beforeCss = queryAt >= 0 ? css.slice(0, queryAt) : css
const grid = (selector) => gridRules.find((r) => r.selector === `${SCOPE} ${selector}`)?.declarations ?? null
// A top-level Classic rule (a selector at the start of a line), whitespace folded.
const classic = (selector) => {
  const escaped = selector.replace(/[.#]/g, '\\$&')
  const m = beforeCss.match(new RegExp(`(?:^|\\n)${escaped}\\s*\\{([^}]*)\\}`))
  return m ? m[1].replace(/\s+/g, ' ').trim() : null
}

describe('Classic is untouched: the Grid rules are one block, at the end, scoped', () => {
  it('there is exactly one Grid size query (1240 x 640 and up), and below it the page is Classic', () => {
    expect(css.split(GRID_QUERY).length - 1).toBe(1)
    expect(gridBlock, 'the Grid block is not in desk.css').not.toBeNull()
    expect(gridRules.length).toBeGreaterThan(80)
    // the layout switch is hidden in the same small sizes where Grid does not apply
    expect(css).toMatch(/@media \(max-width: 1239px\), \(max-height: 639px\) \{ \.layoutswitch \{ display: none; \} \}/)
  })
  it('nothing above the Grid block mentions data-layout: every Classic rule is exactly what it was', () => {
    expect(stripComments(beforeCss)).not.toMatch(/data-layout/)
    expect(beforeCss.length).toBeGreaterThan(20000)
  })
  it('every selector in the block starts with html[data-layout="grid"]', () => {
    const loose = gridRules.flatMap((r) => r.selector.split(',').map((s) => s.trim())).filter((s) => !s.startsWith(SCOPE))
    expect(loose, 'a Grid rule that is not scoped would change Classic').toEqual([])
  })
  it('after the block there are only the layout switch rules: two square buttons, shown with Classic and Grid, hidden below the Grid size, hidden if the script did not run', () => {
    expect(afterRules.length).toBeGreaterThanOrEqual(3)
    for (const r of afterRules) expect(r.selector, 'a rule after the Grid block that is not the switch').toMatch(/\.layoutswitch/)
    expect(afterRules.find((r) => r.selector === '.layoutswitch button')?.declarations).toMatch(/min-height: 28px/)
  })
  it('every page the Grid layout takes over is still hidden when it is not the open page: [hidden] still wins over any display the Grid sets', () => {
    expect(beforeCss).toMatch(/\[hidden\] \{ display: none !important; \}/)
    expect(grid('#page-setup')).not.toMatch(/display/)
  })
})

describe('nothing is lost', () => {
  // Every id of index.html at c19a83534 (the Classic desk), 86 of them. A Grid rule or a later edit may add ids; none may go.
  const CLASSIC_IDS = ['blackoutKeepsArm', 'followLabel', 'followLight', 'followStatus', 'bpm', 'tapBtn', 'master', 'masterVal', 'undoBtn', 'redoBtn', 'saveBtn', 'keysBtn', 'safetyPill', 'blackoutBtn', 'releaseBtn', 'disarmBtn',
    'notice', 'page-control', 'liveName', 'cubeNote', 'removeAsk', 'removeTitle', 'removeList', 'removeNote', 'removeGo', 'removeUndo', 'removeKeep', 'setAsk', 'setTitle', 'setAbout', 'setList', 'setNote', 'setGo', 'setUndo', 'setKeep',
    'sceneRow', 'sceneNote', 'sceneGrid', 'tiles', 'stage', 'lookName', 'preview', 'previewNote', 'editor', 'followGroup', 'followsScene', 'cycleMode', 'shapes', 'cycleField', 'rainbow', 'swatches', 'myColoursHint', 'myColours',
    'colourChooser', 'chooserClose', 'chooserGrid', 'chooserPicker', 'chooserHex', 'chooserAdd', 'pictureFields', 'moveFields', 'mirror', 'lookCubes', 'copyBtn', 'deleteBtn', 'editorEmpty', 'page-setup', 'simNote', 'cubeRows',
    'allOnBtn', 'findBtn', 'found', 'foundList', 'useFoundBtn', 'safetySignOff', 'safetyDark', 'phraseModal', 'phraseForm', 'phraseTitle', 'phraseWhy', 'phraseInput', 'phraseError', 'phraseCancel', 'keysHelp', 'keysTitle', 'keysClose']
  it('all 86 ids of the Classic page are still in index.html, each once', () => {
    expect(CLASSIC_IDS).toHaveLength(86)
    expect(new Set(CLASSIC_IDS).size).toBe(86)
    for (const id of CLASSIC_IDS) expect(doc.querySelectorAll(`[id="${id}"]`).length, `#${id}`).toBe(1)
  })
  it('the .editbody children keep their order: the Grid rules place Shape as child 2 and Colour as child 3', () => {
    const label = (c) => (c.id ? `#${c.id}` : c.querySelector('#shapes') ? 'group:Shape' : c.querySelector('#swatches') ? 'group:Colour' : c.querySelector('#lookCubes') ? 'group.multi:Cubes' : `.${[...c.classList].join('.')}`)
    expect([...doc.getElementById('editor').children].map(label)).toEqual(['#followGroup', 'group:Shape', 'group:Colour', '#pictureFields', '#moveFields', 'group.multi:Cubes', '.actions'])
    expect(grid('.editbody > .group:nth-child(2)')).toMatch(/grid-area: 2 \/ 1 \/ 3 \/ 5/)
    expect(grid('.editbody > .group:nth-child(3)')).toMatch(/grid-area: 1 \/ 1/)
  })
  it('the base rules of the top bar and the stops are the ones Classic had (the Grid block overrides them only under its own scope)', () => {
    expect(classic('.stops')).toBe('flex: none; margin-left: auto; display: flex; align-items: center; gap: 6px; min-height: 30px;')
    expect(classic('.topright')).toBe('flex: 1 0 100%; display: flex; align-items: flex-start; gap: 6px 14px; padding: 6px 10px; flex-wrap: nowrap;')
    expect(classic('.tools')).toBe('flex: 1 1 0; min-width: 0; display: flex; align-items: center; flex-wrap: wrap; gap: 6px;')
    expect(classic('.options')).toBe('flex: 1 1 0; min-width: 0; display: flex; align-items: center; justify-content: flex-end; gap: 14px; padding: 0 10px;')
    expect(classic('#page-control')).toBe('display: grid; grid-template-columns: minmax(0, 1fr) 360px; grid-template-rows: minmax(0, 1.15fr) minmax(0, 1fr); grid-template-areas: "bank editor" "stage editor"; height: calc(100vh - var(--bar-h, 47px));')
  })
  it('the keys 1-9 are printed on the first nine looks, and the grid has nine columns', () => {
    expect(grid('.tile:nth-child(-n+9) .pic::after')).toMatch(/content: counter\(tile\)/)
    expect(gridRules.find((r) => r.selector === SCOPE)?.declarations).toMatch(/--g-cols: 9/)
    expect(grid('.tiles')).toMatch(/repeat\(var\(--g-cols\), minmax\(0, 1fr\)\)/)
  })
})

describe('the signature', () => {
  const everyDeclaration = [...gridRules, ...afterRules].map((r) => r.declarations).join(' ')
  it('square corners: the only radius in the Grid layout is 0', () => {
    for (const m of everyDeclaration.matchAll(/border-radius:\s*([^;]+);?/g)) expect(m[1].trim()).toBe('0')
  })
  it('colours are the page tokens: no #hex, rgb(), hsl() or colour() literal', () => {
    expect(everyDeclaration).not.toMatch(/#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(|\bhwb\(|\blab\(|\blch\(|\bcolor\(/)
    expect(everyDeclaration).toMatch(/var\(--(pane|line|bar|accent|muted|warn)\)/)
  })
  it('no :has(): the layout needs no selector a show-night Chromium may not have (aspect-ratio is already used by Classic: the Preview canvas)', () => {
    expect(gridBlock.body).not.toMatch(/:has\(/)
    expect(stripComments(beforeCss)).toMatch(/aspect-ratio: 3 \/ 2/)
  })
  it('nothing the Grid CSS hides is without its words: the one display:none is the Stage hint, which is in the Stage section title', () => {
    const hidden = gridRules.filter((r) => /display:\s*none/.test(r.declarations)).map((r) => r.selector)
    expect(hidden).toEqual([`${SCOPE} .stage > .panehead .muted`])
    const hint = doc.querySelector('.stage > .panehead .muted').textContent.trim()
    expect(hint.length).toBeGreaterThan(20)
    expect(doc.querySelector('section.stage').getAttribute('title')).toBe(hint)
  })
})

describe('the layout switch in the page', () => {
  it('layoutMode.js is loaded in <head> BEFORE the stylesheet, so the first paint is already in the right layout', () => {
    const script = doc.head.querySelector('script[src="layoutMode.js"]')
    const sheet = doc.head.querySelector('link[rel=stylesheet][href="desk.css"]')
    expect(script).not.toBeNull()
    expect(sheet).not.toBeNull()
    expect(script.compareDocumentPosition(sheet) & 4, 'the script must come before the stylesheet link').toBeTruthy()
  })
  it('the switch is two real buttons in a labelled group, right after the page tabs: Grid and Classic', () => {
    const sw = doc.querySelector('nav.pages').nextElementSibling
    expect(sw.classList.contains('layoutswitch')).toBe(true)
    expect(sw.getAttribute('role')).toBe('group')
    expect(sw.getAttribute('aria-label')).toBe('Layout')
    const buttons = [...sw.querySelectorAll('button')]
    expect(buttons.map((b) => b.dataset.layout)).toEqual(['grid', 'classic'])
    for (const b of buttons) { expect(b.type).toBe('button'); expect(b.hasAttribute('aria-pressed')).toBe(true); expect(b.title.length).toBeGreaterThan(10) }
    expect(buttons.map((b) => b.textContent.trim())).toEqual(['Grid', 'Classic'])
  })
})

describe('the fixes of the build', () => {
  it('#myColoursHint is an ellipsis, never a hole (its words are also its title)', () => {
    const rule = grid('#myColoursHint')
    expect(rule).toMatch(/text-overflow: ellipsis/)
    expect(rule).toMatch(/white-space: nowrap/)
    expect(rule).toMatch(/min-width: 0/)
    expect(rule).toMatch(/flex: 1 1 0/)
    expect(rule).not.toMatch(/display: none/)
    const hint = doc.getElementById('myColoursHint')
    expect(hint.getAttribute('title')).toBe(hint.textContent.trim())
  })
  it('the colour palette is docked INSIDE the strip (over the Picture and Movement columns, in two columns so it fits 188 px), not an upward popover over the Looks', () => {
    const rule = grid('.chooser')
    expect(rule).toMatch(/position: absolute/)
    expect(rule).toMatch(/top: 3px/)
    expect(rule).toMatch(/bottom: 3px/)
    expect(rule).toMatch(/left: 413px/)
    expect(rule).toMatch(/width: 560px/)
    expect(rule).toMatch(/display: grid/)
    expect(rule).toMatch(/overflow: auto/)
    expect(rule).toMatch(/z-index: 5/)
    expect(rule).not.toMatch(/calc\(100%/)
    expect(grid('.editor')).toMatch(/position: relative/)
  })
  it('the stops sit alone at the right end of the bar and above the Keys sheet (z 60 > 20), below the sign-off phrase (z 100)', () => {
    const z = (re) => Number(beforeCss.match(re)?.[1])
    expect(grid('.stops')).toMatch(/z-index: 60/)
    expect(grid('.stops')).toMatch(/position: relative/)
    expect(60).toBeGreaterThan(z(/\.keyshelp \{[^}]*z-index: (\d+)/))
    expect(60).toBeLessThan(z(/\.modal \{[^}]*z-index: (\d+)/))
  })
  it('every control the Grid layout moves or sizes is 22 px or more: the labels, the Master slider, the chips, the swatches, the actions', () => {
    expect(grid('.options > label')).toMatch(/min-height: 24px/)
    expect(grid('.tools .master input')).toMatch(/height: 24px/)
    expect(grid('.editbody .check')).toMatch(/min-height: 22px/)
    expect(grid('.editbody .chip')).toMatch(/min-height: 24px/)
    expect(grid('.editbody .swatches')).toMatch(/repeat\(9, 24px\)/)
    expect(grid('.editbody > .actions button')).toMatch(/min-height: 28px/)
  })
})
