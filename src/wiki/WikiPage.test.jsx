import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import WikiPage from './WikiPage.jsx'

vi.mock('../components/GridFloorBackground.jsx', () => ({ default: () => <canvas data-testid="mock-backdrop" /> }))
import { getAppLocationState } from '../utils/spaceRouting.js'
import { WIKI_ARTICLES, WIKI_HIGHLIGHTS, WIKI_CATEGORIES } from './wikiContent.js'

describe('wikiContent', () => {
    it('every article has the required shape and a unique id', () => {
        const ids = new Set()
        for (const a of WIKI_ARTICLES) {
            expect(typeof a.id).toBe('string')
            expect(a.id.length).toBeGreaterThan(0)
            expect(ids.has(a.id)).toBe(false)
            ids.add(a.id)
            expect(typeof a.title).toBe('string')
            expect(typeof a.summary).toBe('string')
            expect(Array.isArray(a.body)).toBe(true)
            expect(a.body.length).toBeGreaterThan(0)
            expect(WIKI_CATEGORIES).toContain(a.category)
            expect(typeof a.updated).toBe('string')
        }
    })

    it('highlights reference real articles', () => {
        expect(WIKI_HIGHLIGHTS.length).toBeGreaterThan(0)
        for (const h of WIKI_HIGHLIGHTS) {
            expect(WIKI_ARTICLES.some((a) => a.id === h.id)).toBe(true)
        }
    })
})

describe('WikiPage', () => {
    it('renders articles and filters by search', () => {
        render(<WikiPage />)
        expect(screen.getByText('How di.iiii works')).toBeTruthy()
        // an article from the seed content is present
        expect(screen.getAllByText('3 free spaces per account').length).toBeGreaterThan(0)

        fireEvent.change(screen.getByLabelText('Search the wiki'), { target: { value: 'sandbox' } })
        // sandbox article survives the filter; an unrelated one is gone
        expect(screen.getAllByText('The Open Space, your sandbox & guest mode').length).toBeGreaterThan(0)
        expect(screen.queryByText('Keyboard shortcuts')).toBeNull()
    })

    // /wiki names the wiki in the tab; /wiki#{id} names the article that
    // deep-linked in — docs/ai/vocabulary.md's naming rule.
    describe('tab title', () => {
        afterEach(() => {
            window.history.replaceState({}, '', '/wiki')
        })

        it('is "Wiki — di.iiii" with no article named', () => {
            render(<WikiPage />)
            expect(document.title).toBe('Wiki — di.iiii')
        })

        it('names the article that opened it', () => {
            const article = WIKI_ARTICLES[0]
            window.history.replaceState({}, '', `/wiki#${article.id}`)
            render(<WikiPage />)
            expect(document.title).toBe(`${article.title} — Wiki — di.iiii`)
        })

        it('falls back to the plain wiki title for an unknown hash', () => {
            window.history.replaceState({}, '', '/wiki#not-a-real-article')
            render(<WikiPage />)
            expect(document.title).toBe('Wiki — di.iiii')
        })
    })

    // Audit 2026-10-21, G25: each article is its own address, /wiki/{id}.
    describe('an article at its own address', () => {
        afterEach(() => {
            window.history.replaceState({}, '', '/wiki')
            document.querySelector('meta[name="description"]')?.remove()
        })

        it('the router reads /wiki/{id} as the wiki, opened on that article', () => {
            expect(getAppLocationState({ pathname: '/wiki/glossary', search: '' }))
                .toMatchObject({ page: 'wiki', wikiArticleId: 'glossary' })
            expect(getAppLocationState({ pathname: '/wiki', search: '' }).wikiArticleId).toBeUndefined()
            expect(getAppLocationState({ pathname: '/wiki/%E0', search: '' }).wikiArticleId).toBeUndefined()
        })

        it('names the article in the tab and in the meta description', () => {
            const article = WIKI_ARTICLES.find((a) => a.id === 'glossary')
            window.history.replaceState({}, '', '/wiki/glossary')
            render(<WikiPage articleId="glossary" />)
            expect(document.title).toBe(`${article.title} — Wiki — di.iiii`)
            expect(document.querySelector('meta[name="description"]').getAttribute('content')).toBe(article.summary)
        })

        it('every sidebar link is the article\'s own address, not a #hash', () => {
            render(<WikiPage />)
            const links = [...document.querySelectorAll('.wiki-sidebar-link')]
            expect(links).toHaveLength(WIKI_ARTICLES.length)
            for (const link of links) expect(link.getAttribute('href')).toMatch(/^\/wiki\/[^#]+$/)
        })

        it('an id the wiki does not have shows the index at the index\'s address', () => {
            window.history.replaceState({}, '', '/wiki/no-such-article')
            render(<WikiPage articleId="no-such-article" />)
            expect(document.title).toBe('Wiki — di.iiii')
            expect(window.location.pathname).toBe('/wiki')
        })
    })
})

describe('WikiPage backdrop (F138)', () => {
    // jsdom has no scrollIntoView; the page calls it for a deep link left in the
    // address by an earlier test. Without this the run ends with unhandled errors.
    const realScroll = Element.prototype.scrollIntoView
    beforeEach(() => {
        window.history.replaceState(null, '', '/wiki')
        Element.prototype.scrollIntoView = vi.fn()
    })
    afterEach(() => { Element.prototype.scrollIntoView = realScroll })

    it('starts no canvas by default; ?scene=1 brings the 3D backdrop back', async () => {
        const { container, unmount } = render(<WikiPage />)
        await new Promise(resolve => setTimeout(resolve, 30))
        expect(container.querySelectorAll('canvas').length).toBe(0)
        unmount()
        window.history.replaceState(null, '', '/wiki?scene=1')
        try {
            const forced = render(<WikiPage />)
            expect(await forced.findByTestId('mock-backdrop')).toBeTruthy()
        } finally {
            window.history.replaceState(null, '', '/')
        }
    })
})
