// @vitest-environment node
// The one view's photos must be uploaded flipped (flipY=true). With the wall page's flipY=false every face showed
// another part of its photo (the owner, 2026-10-21: "all textures in not the right place"). The measurement behind the
// choice was not committed (see the comment above makeTexture in yard.html), so this guard holds the setting itself:
// it runs the page's own makeTexture and checks that every photo reaches it through an <img> without an override.
import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const page = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), 'yard.html'), 'utf8')
const fn = (name) => {
  const start = page.indexOf(`function ${name}(`)
  expect(start, `${name} is in yard.html`).toBeGreaterThan(-1)
  let depth = 0
  for (let i = page.indexOf('{', start); i < page.length; i++) {
    if (page[i] === '{') depth++
    else if (page[i] === '}' && --depth === 0) return page.slice(start, i + 1)
  }
  throw new Error(`${name}: no end`)
}

describe('yard.html: the photos land on their own faces', () => {
  it('makeTexture flips a photo unless told not to', () => {
    class Texture { constructor(image) { this.image = image } }
    const THREE = { Texture, LinearMipmapLinearFilter: 1, LinearFilter: 2 }
    const renderer = { capabilities: { getMaxAnisotropy: () => 16 } }
    const makeTexture = new Function('THREE', 'renderer', `${fn('makeTexture')}; return makeTexture`)(THREE, renderer)
    expect(makeTexture({}).flipY).toBe(true)
    expect(makeTexture({}, false).flipY).toBe(false)
  })

  it('every photo of a surface goes through makeTexture without an override', () => {
    expect(fn('buildFragment')).toMatch(/makeTexture\(img\)/)
    // only the shadow (an alpha mask, not a photo) keeps the wall page's setting
    expect([...page.matchAll(/makeTexture\([^)]*\)/g)].map((m) => m[0]).filter((c) => c !== 'makeTexture(img)' && !c.startsWith('makeTexture(img,flipY')))
      .toEqual(['makeTexture(img,false)'])
    expect(fn('buildShadow')).toContain('makeTexture(img,false)')
  })

  it('photos are decoded through an <img>: an ImageBitmap would ignore flipY', () => {
    expect(page).not.toMatch(/createImageBitmap|ImageBitmapLoader/)
    expect(fn('loadImage')).toMatch(/new Image\(\)/)
  })
})

// N1248 (owner 2026-10-23: "movement in the yard so bad"): the yard follows the hands, not the 78 s tour; the eye stays
// outside the building and above the ground; the hero lets the wheel scroll the front page.
describe('yard.html: moving in the yard (N1248)', () => {
  it('the camera in the yard is the orbit, never the tour pose', () => {
    expect(page).toMatch(/\}else if\(where===0\)\{\n    orbStep\(t,dt,pointers\.size>0\);/)
  })
  it('keeps the eye out of the building box, the turn point inside it, inertia capped, idle only after 30 s', () => {
    expect(page).toMatch(/function orbOutside\(pos,t\)/)
    expect(page).toMatch(/pushed=orbOutside\(pos,ORB\.ct\)/)
    expect(page).toMatch(/orbClampTarget\(ORB\.gt\)/)
    expect(page).toMatch(/ORB_PHI=\[0\.05,1\.35\]/)
    expect(page).toMatch(/ORB_SPIN_MAX=1\.5/)
    expect(page).toMatch(/IDLE_AFTER=30/)
  })
  it('in the hero the wheel scrolls the page unless Ctrl/Cmd is held', () => {
    expect(page).toMatch(/wheelOwner\(\{hero:HERO,active,ctrl:e\.ctrlKey,meta:e\.metaKey\}\)==='page'/)
  })
})

// Owner 10-23 (N1250): full hands (the Studio mapping) and cooperative gestures on a page that scrolls
// (Google Maps gestureHandling 'cooperative', Mapbox GL JS cooperativeGestures).
describe('yard.html: full hands and cooperative gestures (N1250)', () => {
  const handsMode = new Function(`${fn('handsMode')}; return handsMode`)()
  const wheelOwner = new Function(`${fn('wheelOwner')}; return wheelOwner`)()
  it('mouse: left turns, right pans, middle comes closer (mappings.js studio)', () => {
    expect(handsMode({ touch: false, n: 1, button: 0 })).toBe('turn')
    expect(handsMode({ touch: false, n: 1, button: 2 })).toBe('pan')
    expect(handsMode({ touch: false, n: 1, button: 1 })).toBe('dolly')
  })
  it('touch: one finger turns on a full-page view; on a page that scrolls it is the page until a tap takes the view', () => {
    expect(handsMode({ touch: true, n: 1, hero: false })).toBe('turn')
    expect(handsMode({ touch: true, n: 1, hero: true, active: false })).toBe('page')
    expect(handsMode({ touch: true, n: 1, hero: true, active: true })).toBe('turn')
    expect(handsMode({ touch: true, n: 2, hero: true, active: false })).toBe('pinch')
  })
  it('wheel: the page scrolls through a hero not in use; Ctrl/Cmd or a click hands it to the view; full-page views always zoom', () => {
    expect(wheelOwner({ hero: true })).toBe('page')
    expect(wheelOwner({ hero: true, ctrl: true })).toBe('view')
    expect(wheelOwner({ hero: true, meta: true })).toBe('view')
    expect(wheelOwner({ hero: true, active: true })).toBe('view')
    expect(wheelOwner({ hero: false })).toBe('view')
  })
  it('no context menu on the canvas; right drag pans inside the box; Esc gives the view back', () => {
    expect(page).toMatch(/canvas\.addEventListener\('contextmenu',e=>e\.preventDefault\(\)\)/)
    expect(fn('orbPan')).toMatch(/orbClampTarget\(ORB\.gt\)/)
    expect(page).toMatch(/e\.key==='Escape'\) setActive\(false\)/)
    expect(page).toMatch(/body\.hero #c\{touch-action:pan-x pan-y\}/)
  })
})
