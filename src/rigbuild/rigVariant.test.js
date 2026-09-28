// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { rigVariantOf, versionLinks } from './rigVariant.js'
import RigVersionSwitch from './RigVersionSwitch.jsx'

// The version switch in the space view (RIG_BUILD.md §15.1).
const variant = {
    set: 'moxir-2026-10-17', id: 'minimal', title: 'Minimal — one line, one colour',
    siblings: [
        { id: 'ordered', projectId: 'moxir-hall', title: 'As ordered — the rig of the 27.09 order' },
        { id: 'minimal', projectId: 'moxir-hall-minimal', title: 'Minimal — one line, one colour' },
        { id: 'full', projectId: 'moxir-hall-full', title: 'Full — the whole list, used darkly' }
    ]
}
const entities = [{ id: 'place-hall', components: {} }, { id: 'rig-show', components: { rigVariant: variant } }]

describe('the rig version switch', () => {
    it('reads the set from the show entity, in order, with the current one marked', () => {
        const links = versionLinks(rigVariantOf(entities), 'moxir-hall-minimal', (p) => `/moxir/p/${p}`)
        expect(links.map((l) => [l.id, l.href, l.current])).toEqual([
            ['ordered', '/moxir/p/moxir-hall', false],
            ['minimal', '/moxir/p/moxir-hall-minimal', true],
            ['full', '/moxir/p/moxir-hall-full', false]
        ])
    })

    it('is nothing on a room that is not one of a set', () => {
        expect(rigVariantOf([{ id: 'x', components: {} }])).toBe(null)
        expect(versionLinks({ ...variant, siblings: variant.siblings.slice(0, 1) }, 'moxir-hall', String)).toBe(null)
        expect(renderToStaticMarkup(createElement(RigVersionSwitch, { spaceId: 'moxir', projectId: 'p', entities: [] }))).toBe('')
    })

    it('before it knows what the space holds, shows only the version you are in — no link that could be dead', () => {
        // a static render runs no effect: the space's list is still unknown
        const html = renderToStaticMarkup(createElement(RigVersionSwitch, { spaceId: 'moxir', projectId: 'moxir-hall-minimal', entities }))
        expect(html).toMatch(/aria-label="rig versions"/)
        expect(html).toMatch(/aria-current="page"[^>]*>Minimal<\/a>/)
        expect(html).toMatch(/min-height:44px/)
        expect(html).not.toMatch(/moxir-hall-full/)
        expect(versionLinks(variant, 'moxir-hall-minimal', (p) => `/moxir/p/${p}`, null).map((l) => l.id)).toEqual(['minimal'])
    })
})

// Owner, rigbuilder.7 (2026-09-28): clicked Full → /moxir/p/moxir-hall-full → "Project not
// found." The set named four versions; the space held two. The switch links only what exists.
describe('the switch links only projects the space holds', () => {
    const href = (p) => `/moxir/p/${p}`
    it('drops a version whose project is missing, keeps the order and the current one', () => {
        const links = versionLinks(variant, 'moxir-hall-minimal', href, new Set(['moxir-hall', 'moxir-hall-minimal']))
        expect(links.map((l) => [l.id, l.current])).toEqual([['ordered', false], ['minimal', true]])
        expect(links.some((l) => l.href.endsWith('moxir-hall-full'))).toBe(false)
    })

    it('never links a project not in the list, whatever the set says', () => {
        const have = ['moxir-hall', 'moxir-hall-minimal', 'moxir-hall-full']
        const links = versionLinks(variant, 'moxir-hall', href, have)
        for (const l of links) expect(have.some((p) => l.href === href(p))).toBe(true)
        expect(links).toHaveLength(3)
    })

    it('has no row when fewer than two versions really exist', () => {
        expect(versionLinks(variant, 'moxir-hall-minimal', href, new Set(['moxir-hall-minimal']))).toBe(null)
    })
})
