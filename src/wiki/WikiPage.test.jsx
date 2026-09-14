import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import WikiPage from './WikiPage.jsx'
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
})
