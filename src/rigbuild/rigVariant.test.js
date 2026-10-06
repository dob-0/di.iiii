// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { rigVariantOf, shortTitle, versionLinks } from './rigVariant.js'
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

// Owner, 2026-09-30, /moxir on his screen: the switch showed two entries of the eight live
// versions. Each version's stored `siblings` was frozen when it was built (measured on the
// local install, below); the switch now reads the space's own list.
describe('the switch lists the space\'s live versions, from every version', () => {
    const SET = 'moxir-2026-10-17'
    const H = 'moxir-hall'
    const href = (p) => `/moxir/p/${p}`
    const sib = (...ids) => ids.map((projectId) => ({ id: projectId.replace(`${H}-`, ''), projectId, title: projectId }))
    // stored lists as measured (H = moxir-hall; hall, middle, full are archived on purpose)
    const stored = {
        [`${H}-minimal`]: sib(H, `${H}-minimal`, `${H}-minimal-cut-movers`, `${H}-middle`, `${H}-full`),
        [`${H}-minimal-halo`]: sib(H, `${H}-minimal`, `${H}-middle`, `${H}-full`, `${H}-minimal-halo`),
        [`${H}-minimal-xflat`]: sib(H, `${H}-minimal`, `${H}-middle`, `${H}-full`, `${H}-minimal-xflat`, `${H}-minimal-xflat-heads`)
    }
    const mark = (id, title, extra = {}) => ({ set: SET, id, title, summary: `${id}.`, ...extra })
    const copyOf = (projectId) => ({ projectId, label: 'old hall 09-29' })
    // what GET /api/spaces/moxir/contents returns to a visitor: only live rows, with their marks
    const rows = [
        { id: `${H}-minimal`, rigVariant: mark('minimal', 'Minimal — the cut, simple: fixed lights only') },
        { id: `${H}-minimal-cut-movers`, rigVariant: mark('minimal-cut-movers', 'The cut, full: moving heads on the line') },
        { id: `${H}-minimal-halo`, rigVariant: mark('minimal-halo', 'Minimal · halo') },
        { id: `${H}-minimal-halo-heads`, rigVariant: mark('minimal-halo-heads', 'Minimal · halo · heads') },
        { id: `${H}-minimal-xflat`, rigVariant: mark('minimal-xflat', 'Minimal · X lying down') },
        { id: `${H}-minimal-xflat-heads`, rigVariant: mark('minimal-xflat-heads', 'Minimal · X lying down · heads') },
        { id: `${H}-minimal-oldhall-0929`, rigVariant: mark('minimal-oldhall-0929', 'Minimal · old hall 09-29 — the cut, simple', { copyOf: copyOf(`${H}-minimal`) }) },
        { id: `${H}-minimal-halo-oldhall-0929`, rigVariant: mark('minimal-halo-oldhall-0929', 'Minimal · halo · old hall 09-29', { copyOf: copyOf(`${H}-minimal-halo`) }) },
        { id: 'moxir-sources' }, { id: 'moxir-truss' }
    ]
    const LIVE = ['minimal', 'minimal-cut-movers', 'minimal-halo', 'minimal-halo-heads', 'minimal-xflat', 'minimal-xflat-heads']
    const variantFor = (projectId, id) => ({ set: SET, id, title: projectId, siblings: stored[projectId] })

    it('the stored lists alone reproduce the bug: Minimal and Halo each reach 2 of 8', () => {
        const ids = (p, id) => versionLinks(variantFor(p, id), p, href, rows.map((r) => r.id)).map((l) => l.href)
        expect(ids(`${H}-minimal`, 'minimal')).toHaveLength(2) // itself + cut-movers, of eight live
        expect(versionLinks(variantFor(`${H}-minimal-halo`, 'minimal-halo'), `${H}-minimal-halo`, href, rows.map((r) => r.id))).toHaveLength(2)
    })

    it.each([
        [`${H}-minimal`, 'minimal'],
        [`${H}-minimal-halo`, 'minimal-halo'],
        [`${H}-minimal-xflat`, 'minimal-xflat'],
        [`${H}-minimal-oldhall-0929`, 'minimal-oldhall-0929']
    ])('from %s every live version is one tap away, the same row from each', (projectId, id) => {
        const links = versionLinks(variantFor(projectId, id), projectId, href, rows)
        expect(links.filter((l) => !l.copy).map((l) => l.id)).toEqual(LIVE)
        expect(links.filter((l) => l.current).map((l) => l.href)).toEqual([href(projectId)])
    })

    it('never links an archived, missing or unmarked project', () => {
        const links = versionLinks(variantFor(`${H}-minimal`, 'minimal'), `${H}-minimal`, href, rows)
        const hrefs = links.map((l) => l.href)
        for (const gone of [H, `${H}-middle`, `${H}-full`, 'moxir-sources', 'moxir-truss']) expect(hrefs).not.toContain(href(gone))
        expect(new Set(hrefs).size).toBe(hrefs.length)
    })

    it('a version that was made private or archived after the others drops out of every row', () => {
        const visitor = rows.filter((r) => r.id !== `${H}-minimal-halo-heads`)
        expect(versionLinks(variantFor(`${H}-minimal`, 'minimal'), `${H}-minimal`, href, visitor).map((l) => l.id)).not.toContain('minimal-halo-heads')
    })

    it('labelled old-hall copies come after the live versions, marked as copies, never among them', () => {
        const links = versionLinks(variantFor(`${H}-minimal`, 'minimal'), `${H}-minimal`, href, rows)
        expect(links.map((l) => l.copy)).toEqual([false, false, false, false, false, false, true, true])
        expect(links.slice(-2).map((l) => l.title)).toEqual([
            'Minimal · halo · old hall 09-29',
            'Minimal · old hall 09-29 — the cut, simple'
        ])
        expect(shortTitle(links.at(-1).title, links.at(-1).id)).toBe('Minimal · old hall 09-29')
    })

    it('keeps the order stable whichever version you stand in', () => {
        const order = (p, id) => versionLinks(variantFor(p, id), p, href, rows).map((l) => l.href)
        expect(order(`${H}-minimal-xflat`, 'minimal-xflat')).toEqual(order(`${H}-minimal`, 'minimal'))
        expect(order(`${H}-minimal-halo`, 'minimal-halo')).toEqual(order(`${H}-minimal`, 'minimal'))
    })

    it('a version opened by its address though it is not on the list is still shown, marked current', () => {
        const links = versionLinks(variantFor(H, 'ordered'), H, href, rows)
        expect(links.find((l) => l.current).href).toBe(href(H))
        expect(links).toHaveLength(9)
    })

    it('a document with no siblings list but a mark still gets its row from the space', () => {
        const v = { set: SET, id: 'minimal-halo', title: 'Minimal · halo' }
        expect(rigVariantOf([{ id: 'rig-show', components: { rigVariant: v } }])).toBe(v)
        expect(versionLinks(v, `${H}-minimal-halo`, href, rows)).toHaveLength(8)
    })

    it('documents without the marker in the space keep the stored list, filtered as before', () => {
        const bare = [{ id: H }, { id: `${H}-minimal` }, { id: `${H}-minimal-cut-movers` }]
        const links = versionLinks(variantFor(`${H}-minimal`, 'minimal'), `${H}-minimal`, href, bare)
        expect(links.map((l) => l.href)).toEqual([href(H), href(`${H}-minimal`), href(`${H}-minimal-cut-movers`)])
        // and still no dead link: "Project not found" stays guarded
        expect(links.some((l) => l.href.endsWith('-full'))).toBe(false)
    })

    it('other sets in the space are not mixed in', () => {
        const other = [...rows, { id: 'other-a', rigVariant: { set: 'another', id: 'a', title: 'A' } }]
        expect(versionLinks(variantFor(`${H}-minimal`, 'minimal'), `${H}-minimal`, href, other).map((l) => l.href)).not.toContain(href('other-a'))
    })

    it('a version with no title is called by its id, never an empty tap target', () => {
        const noTitle = rows.map((r) => (r.id === `${H}-minimal-halo` ? { ...r, rigVariant: { ...r.rigVariant, title: '' } } : r))
        const l = versionLinks(variantFor(`${H}-minimal`, 'minimal'), `${H}-minimal`, href, noTitle).find((x) => x.href === href(`${H}-minimal-halo`))
        expect(shortTitle(l.title, l.id)).toBe('minimal-halo')
        expect(shortTitle('', '')).toBe('')
    })
})
