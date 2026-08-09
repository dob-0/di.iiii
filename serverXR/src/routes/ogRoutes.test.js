import { describe, it, expect } from 'vitest'
import { createRequire } from 'node:module'
const { ogHtml } = createRequire(import.meta.url)('./ogRoutes')

describe('link preview cards', () => {
  it('names the space, not the platform', () => {
    const h = ogHtml({ url: 'https://di-studio.xyz/br_id_ge', title: 'br_id_ge', description: 'a rite in five acts', image: '/og/br-id-ge.png' })
    expect(h).toContain('<meta property="og:title" content="br_id_ge">')
    expect(h).not.toContain('browser-native XR authoring')
    // the whole point: the card must not be the platform tile
    expect(h).not.toContain('/brand/og-image.png')
  })

  it('escapes a title that carries markup', () => {
    const h = ogHtml({ url: 'https://x/y', title: 'a "<script>alert(1)</script>" space', description: 'd' })
    expect(h).not.toContain('<script>')
    expect(h).toContain('&lt;script&gt;')
  })

  it('a quote in a title cannot break out of the content attribute', () => {
    const h = ogHtml({ url: 'https://x/y', title: 'x" data-evil="1', description: 'd' })
    const line = h.split('\n').find((l) => l.includes('og:title'))
    expect(line).toBe('<meta property="og:title" content="x&quot; data-evil=&quot;1">')
  })

  it('falls back to the platform tile when a space has no card', () => {
    const h = ogHtml({ url: 'https://x/y', title: 't', description: 'd' })
    expect(h).toContain('/brand/og-image.png')
  })

  it('sends a human on to the real page rather than dead-ending', () => {
    const h = ogHtml({ url: 'https://di-studio.xyz/br_id_ge', title: 't', description: 'd' })
    expect(h).toContain('http-equiv="refresh"')
    expect(h).toContain('rel="canonical" href="https://di-studio.xyz/br_id_ge"')
  })
})
