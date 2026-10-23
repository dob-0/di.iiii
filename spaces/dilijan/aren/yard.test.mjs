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
