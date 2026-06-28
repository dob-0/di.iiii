import { describe, expect, it } from 'vitest'

import { collectWikiSyncErrors } from '../scripts/wiki-sync-lib.mjs'
import { WIKI_ARTICLES, WIKI_CATEGORIES, WIKI_HIGHLIGHT_IDS } from './wiki/wikiContent.js'

const validArticle = (overrides = {}) => ({
    id: 'sample-article',
    category: 'Getting started',
    title: 'Sample',
    summary: 'A sample article.',
    body: ['A paragraph.', { list: ['one', 'two'] }],
    tags: ['sample'],
    updated: '2026-06-28',
    ...overrides
})

const baseInput = (articles) => ({
    articles,
    categories: ['Getting started', 'Editing'],
    highlightIds: ['sample-article']
})

describe('collectWikiSyncErrors', () => {
    it('passes the real shipped wiki content', () => {
        expect(
            collectWikiSyncErrors({
                articles: WIKI_ARTICLES,
                categories: WIKI_CATEGORIES,
                highlightIds: WIKI_HIGHLIGHT_IDS
            })
        ).toEqual([])
    })

    it('accepts a well-formed article set', () => {
        expect(collectWikiSyncErrors(baseInput([validArticle()]))).toEqual([])
    })

    it('flags a highlight id with no matching article (the silent-drop bug)', () => {
        const errors = collectWikiSyncErrors({
            ...baseInput([validArticle()]),
            highlightIds: ['sample-article', 'does-not-exist']
        })
        expect(errors.some((e) => e.includes('does-not-exist'))).toBe(true)
    })

    it('flags a duplicate article id', () => {
        const errors = collectWikiSyncErrors(baseInput([validArticle(), validArticle()]))
        expect(errors.some((e) => e.includes('Duplicate article id'))).toBe(true)
    })

    it('flags an unknown category', () => {
        const errors = collectWikiSyncErrors(baseInput([validArticle({ category: 'Nope' })]))
        expect(errors.some((e) => e.includes('unknown category'))).toBe(true)
    })

    it('flags an invalid updated date', () => {
        const errors = collectWikiSyncErrors(baseInput([validArticle({ updated: 'June 2026' })]))
        expect(errors.some((e) => e.includes('invalid `updated` date'))).toBe(true)
    })

    it('flags a malformed body', () => {
        const errors = collectWikiSyncErrors(baseInput([validArticle({ body: [] })]))
        expect(errors.some((e) => e.includes('malformed body'))).toBe(true)
    })

    it('flags a missing required field', () => {
        const { summary, ...noSummary } = validArticle()
        const errors = collectWikiSyncErrors(baseInput([noSummary]))
        expect(errors.some((e) => e.includes('missing required field: summary'))).toBe(true)
    })
})
