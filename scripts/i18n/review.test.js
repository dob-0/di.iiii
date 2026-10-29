// The owner's word check (languages design, docs/ai/decisions/2026-10-29-languages-in-the-address.md):
// the six core words have an Armenian and a Russian row in docs/ai/vocabulary.md, each with a state and
// a source; review.mjs puts every one of them on one page; his answer is written back as checked.
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { applyAnswer, parseCoreWords, renderReviewPage } from './review.mjs'

const repoDir = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const vocabulary = readFileSync(resolve(repoDir, 'docs/ai/vocabulary.md'), 'utf8')
const CORE = ['space', 'project', 'scene', 'object', 'place', 'production']
const ARMENIAN = /^[Ա-֏]+$/
const CYRILLIC = /^[Ѐ-ӿ]+$/

describe('the six core words in Armenian and Russian', () => {
    const rows = parseCoreWords(vocabulary)

    it('lists all six words, once each, in the dictionary order', () => {
        expect(rows.map((row) => row.id)).toEqual(CORE)
    })

    it.each(CORE)('%s has an Armenian and a Russian row with a state and a source', (word) => {
        const row = rows.find((r) => r.id === word)
        expect(row.meaning, `${word}: its English meaning comes from the dictionary`).not.toBe('')
        expect(row.hy.says).toMatch(ARMENIAN)
        expect(row.ru.says).toMatch(CYRILLIC)
        for (const lang of ['hy', 'ru']) {
            expect(['unverified', 'checked']).toContain(row[lang].state)
            expect(row[lang].source).toMatch(/^(machine:[\w.-]+|human:[^@]+)@\d{4}-\d{2}-\d{2}$/)
            expect(row[lang].why.length, `${word} ${lang}: one line on why this word`).toBeGreaterThan(20)
            // A row is checked exactly when a person checked it.
            expect(row[lang].state === 'checked').toBe(row[lang].source.startsWith('human:'))
        }
    })

    it('puts every word and its state on the one review page', () => {
        const html = renderReviewPage(rows, { date: '2026-10-29' })
        for (const row of rows) {
            const section = html.slice(html.indexOf(`data-id="${row.id}"`), html.indexOf('</section>', html.indexOf(`data-id="${row.id}"`)))
            expect(section).toContain(`<b>${row.hy.says}</b>`)
            expect(section).toContain(`<b>${row.ru.says}</b>`)
            expect(section).toContain(`hy ${row.hy.state}`)
            expect(section).toContain(`ru ${row.ru.state}`)
        }
        expect(html).toContain('<meta name="robots" content="noindex">')
    })

    it('writes his answer back as checked by him, and changes no other row', () => {
        const next = applyAnswer(vocabulary, { word: 'place', lang: 'hy', by: 'Gev', date: '2026-10-30', says: 'Սրահ' })
        const after = parseCoreWords(next)
        const place = after.find((row) => row.id === 'place')
        expect(place.hy).toMatchObject({ says: 'Սրահ', state: 'checked', source: 'human:Gev@2026-10-30' })
        expect(place.ru).toEqual(rows.find((row) => row.id === 'place').ru)
        expect(after.filter((row) => row.id !== 'place')).toEqual(rows.filter((row) => row.id !== 'place'))
        expect(next.replace(/\| place \| hy \|[^\n]*/, '')).toBe(vocabulary.replace(/\| place \| hy \|[^\n]*/, ''))
    })

    it('an OK keeps the word and refuses an answer with no name', () => {
        const ok = parseCoreWords(applyAnswer(vocabulary, { word: 'space', lang: 'ru', by: 'Gev', date: '2026-10-30' }))
        expect(ok[0].ru).toMatchObject({ says: rows[0].ru.says, state: 'checked' })
        expect(() => applyAnswer(vocabulary, { word: 'space', lang: 'ru', date: '2026-10-30' })).toThrow(/--by/)
        expect(() => applyAnswer(vocabulary, { word: 'room', lang: 'ru', by: 'Gev', date: '2026-10-30' })).toThrow(/0 rows/)
        expect(() => applyAnswer(vocabulary, { word: 'place', lang: 'hy', by: 'Gev', date: '2026-10-30', says: 'Վայր | Սրահ' })).toThrow(/--says/)
    })
})
