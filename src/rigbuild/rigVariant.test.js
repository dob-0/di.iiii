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

    it('renders plain links with the short names, the current one aria-current', () => {
        const html = renderToStaticMarkup(createElement(RigVersionSwitch, { spaceId: 'moxir', projectId: 'moxir-hall-minimal', entities }))
        expect(html).toMatch(/aria-label="rig versions"/)
        expect(html).toMatch(/href="\/moxir\/p\/moxir-hall-full"[^>]*>Full<\/a>/)
        expect(html).toMatch(/aria-current="page"[^>]*>Minimal<\/a>/)
        expect(html).toMatch(/min-height:44px/)
    })
})
