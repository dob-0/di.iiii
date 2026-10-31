// @vitest-environment jsdom
// The desk switch on the light desk's page (owner, 2026-10-31, Projector Room: from the Show desk to the Light or Laser desk there was no way back, and the desks run in
// a window with no address bar). Show · Light · Laser sit in the top line right after the di.iiii mark, plain links in the same window; this page is the current one.
// Framed as the visualiser's desk half the switch steps aside with the other doors. jsdom has no layout engine, so the markup and the rules are guarded here; the real
// widths were measured in a browser (session note).
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const here = path.dirname(fileURLToPath(import.meta.url))
const doc = new DOMParser().parseFromString(fs.readFileSync(path.join(here, 'index.html'), 'utf8'), 'text/html')
const css = fs.readFileSync(path.join(here, 'style.css'), 'utf8')
// Every top-level rule whose selector mentions .deskswitch: { selector, declarations }.
const switchRules = [...css.matchAll(/(?:^|\n)([^{}\n/]*\.deskswitch[^{}]*)\{([^}]*)\}/g)].map((m) => ({ selector: m[1].trim(), declarations: m[2] }))
const rule = (selector) => switchRules.find((r) => r.selector === selector)?.declarations ?? ''

describe('the desk switch in the top line', () => {
  it('Show, Light and Laser are three plain links right after the di.iiii mark, and the Light desk is the current one', () => {
    const mark = doc.querySelector('header.topbar > a.homelink')
    expect(mark?.textContent).toBe('di.iiii')
    const nav = mark.nextElementSibling
    expect(nav?.matches('nav.deskswitch'), 'no nav.deskswitch right after the di.iiii mark').toBe(true)
    const links = [...nav.querySelectorAll('a')]
    expect(links.map((a) => a.textContent.trim())).toEqual(['Show', 'Light', 'Laser'])
    expect(links.map((a) => a.getAttribute('href'))).toEqual(['../show/', './', '../laser/'])
    for (const a of links) expect(a.hasAttribute('target'), `${a.textContent} opens in the same window`).toBe(false)
    expect(links.filter((a) => a.getAttribute('aria-current') === 'page').map((a) => a.textContent)).toEqual(['Light'])
  })

  it('each link is a square at least 44 px tall, the current desk is marked beyond colour, the colours are tokens only, and the visualiser frame hides it', () => {
    expect(rule('.deskswitch a')).toMatch(/min-height:\s*44px/)
    expect(rule('.deskswitch a')).toMatch(/border-radius:\s*0\b/)
    expect(rule('.deskswitch a[aria-current="page"]')).toMatch(/background:\s*var\(--/)
    expect(rule('.deskswitch a[aria-current="page"]')).toMatch(/border-bottom:\s*3px solid var\(--accent\)/)
    expect(rule('.is-framed .topbar .deskswitch')).toMatch(/display:\s*none\s*!important/)
    const all = switchRules.map((r) => r.declarations).join(' ')
    expect(all).not.toMatch(/border-radius:\s*[1-9]/)
    expect(all, 'a colour that is not a token').not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/i)
  })
})
