// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { moveAddressHtml, moveAddressPortals } from './pages-lib.mjs'

describe('moveAddressHtml', () => {
  it('moves every link into the space, in plain, escaped and srcdoc quotes, and nothing else', () => {
    const h = '<a href="/dilijan/welcome"><a href=\'/dilijan#works\'><a href="/dilijan"><a href=\\"/dilijan/the-yard\\">'
      + ' srcdoc="&quot;/dilijan/orange-room&quot;" <a href="/dilijanx/a"><a href="/open/dilijan"><a href="https://x.y/dilijan/z">'
    const r = moveAddressHtml(h, 'dilijan', 'dilijan-camp')
    expect(r.count).toBe(5)
    expect(r.html).toContain('"/dilijan-camp/welcome"')
    expect(r.html).toContain("'/dilijan-camp#works'")
    expect(r.html).toContain('"/dilijan-camp"')
    expect(r.html).toContain('\\"/dilijan-camp/the-yard\\"')
    expect(r.html).toContain('&quot;/dilijan-camp/orange-room&quot;')
    expect(r.html).toContain('"/dilijanx/a"')
    expect(r.html).toContain('"/open/dilijan"')
    expect(r.html).toContain('"https://x.y/dilijan/z"')
  })
  it('a second run changes nothing', () => {
    const once = moveAddressHtml('<a href="/dilijan/welcome">', 'dilijan', 'dilijan-camp').html
    expect(moveAddressHtml(once, 'dilijan', 'dilijan-camp').count).toBe(0)
  })
  it('refuses an address the platform would refuse', () => {
    expect(() => moveAddressHtml('', 'dilijan', 'dilijan_camp')).toThrow()
  })
})

describe('moveAddressPortals', () => {
  it('repoints only doors into the space', () => {
    const r = moveAddressPortals([
      { id: 'a', components: { reference: { spaceId: 'dilijan', projectId: 'w' } } },
      { id: 'b', components: { reference: { spaceId: 'open', projectId: 'x' } } },
      { id: 'c', components: {} }
    ], 'dilijan', 'dilijan-camp')
    expect(r.count).toBe(1)
    expect(r.entities[0].components.reference).toEqual({ spaceId: 'dilijan-camp', projectId: 'w' })
    expect(r.entities[1].components.reference.spaceId).toBe('open')
  })
})

describe('absolute asset links', async () => {
  const { absoluteAssets, toRelativeAssets } = await import('./pages-lib.mjs')
  const html = '<img src="https://di-studio.xyz/serverXR/api/projects/w/assets/05979b1cb6f2b66d"><img src="https://diiii.xyz/serverXR/api/projects/w/assets/4dbb2f67a7b8cd0a"><img src="/serverXR/api/projects/w/assets/aaaaaaaaaaaaaaaa">'
  it('finds each one once, as its relative path', () => {
    expect(absoluteAssets(html)).toEqual(['/serverXR/api/projects/w/assets/05979b1cb6f2b66d', '/serverXR/api/projects/w/assets/4dbb2f67a7b8cd0a'])
  })
  it('makes relative only the ones this server has', () => {
    const r = toRelativeAssets(html, ['/serverXR/api/projects/w/assets/05979b1cb6f2b66d'])
    expect(r.count).toBe(1)
    expect(r.html).toContain('src="/serverXR/api/projects/w/assets/05979b1cb6f2b66d"')
    expect(r.html).toContain('https://diiii.xyz/serverXR/api/projects/w/assets/4dbb2f67a7b8cd0a')
  })
})

