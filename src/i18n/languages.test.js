/**
 * The language table (S13b): the server file and the client mirror carry the
 * same data and give the same answer to every row of one case table; the codes
 * are reserved on both sides; robots.txt has the admin and preferences twins.
 */
import { describe, it, expect } from 'vitest'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import * as client from './languages.js'
import { RESERVED_APP_SEGMENTS, stripAppBasePath } from '../utils/spaceRouting.js'
import { createBasePathHelpers } from '../project/routing/laneBasePath.js'
import { WORK_IDS } from '../works/works.js'

const require = createRequire(import.meta.url)
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const server = require(path.join(ROOT, 'shared/i18n/languages.cjs'))
const reserved = require(path.join(ROOT, 'shared/reservedSegments.cjs'))
const cases = JSON.parse(readFileSync(path.join(ROOT, 'shared/i18n/langPath.cases.json'), 'utf8'))
const robots = readFileSync(path.join(ROOT, 'public/robots.txt'), 'utf8')

describe.each([
    ['server', server],
    ['client', client]
])('language helpers (%s)', (_name, lib) => {
    it.each(cases.splitLang)('splitLang(%s)', (input, expected) => {
        expect(lib.splitLang(input)).toEqual(expected)
    })
    it.each(cases.withLang)('withLang(%s, %s)', (lang, input, expected) => {
        expect(lib.withLang(lang, input)).toBe(expected)
    })
    it.each(cases.isLanguageFree)('isLanguageFree(%s)', (input, expected) => {
        expect(lib.isLanguageFree(input)).toBe(expected)
    })
    it.each(cases.isPreviewHost)('isPreviewHost(%s)', (input, expected) => {
        expect(lib.isPreviewHost(input)).toBe(expected)
    })
    it('withLang then splitLang gives the path back', () => {
        for (const [, split] of cases.splitLang) {
            expect(lib.splitLang(lib.withLang(split.lang, split.path))).toEqual(split)
        }
    })
})

describe('one table, two copies', () => {
    it('the server table and the client mirror hold the same data', () => {
        expect(client.LANGUAGES).toEqual(server.LANGUAGES)
        expect(client.DEFAULT_LANGUAGE).toBe(server.DEFAULT_LANGUAGE)
    })
    it('the table says what the design says', () => {
        const byCode = Object.fromEntries(server.LANGUAGES.map((l) => [l.code, l]))
        expect(byCode.en).toMatchObject({ prefixed: false, public: true })
        expect(byCode.hy).toMatchObject({ nativeName: 'Հայերեն', label: 'ՀԱՅ', locale: 'hy_AM', public: false })
        expect(byCode.ru).toMatchObject({ nativeName: 'Русский', label: 'РУС', locale: 'ru_RU', public: false })
    })
    it('both copies hold the same language-free words', () => {
        expect([...client.languageFreeSegments()].sort()).toEqual([...server.languageFreeSegments()].sort())
    })
    it('every work id is language-free, on both sides', () => {
        expect([...server.WORK_IDS].sort()).toEqual([...WORK_IDS].sort())
        for (const id of WORK_IDS) {
            expect(server.isLanguageFree(`/${id}`)).toBe(true)
            expect(client.isLanguageFree(`/${id}/x`)).toBe(true)
        }
    })
})

describe('the codes are reserved words', () => {
    it.each(['en', 'hy', 'ru'])('%s is reserved on the server and on the client', (code) => {
        expect(reserved.RESERVED_SPACE_SLUGS.has(code)).toBe(true)
        expect(reserved.RESERVED_PROJECT_SLUGS.has(code)).toBe(true)
        expect(RESERVED_APP_SEGMENTS).toContain(code)
    })
})

describe('robots.txt', () => {
    it.each(server.PREFIXED_CODES)('%s has its admin and preferences twins', (code) => {
        const lines = robots.split('\n')
        expect(lines).toContain(`Disallow: /${code}/admin`)
        expect(lines).toContain(`Disallow: /${code}/preferences`)
    })
    it('never disallows a language root (a noindex page must not be blocked)', () => {
        for (const code of server.PREFIXED_CODES) {
            expect(robots.split('\n')).not.toContain(`Disallow: /${code}`)
            expect(robots.split('\n')).not.toContain(`Disallow: /${code}/`)
        }
    })
})

describe('a base path owns whole segments only', () => {
    it("base '/hy' keeps '/hyper/studio' (the lane helper)", () => {
        const { stripBasePath } = createBasePathHelpers('/hy')
        expect(stripBasePath('/hyper/studio')).toBe('/hyper/studio')
        expect(stripBasePath('/hy/studio')).toBe('/studio')
        expect(stripBasePath('/hy')).toBe('/')
    })
    it('the app strip keeps working at the root base', () => {
        expect(stripAppBasePath('/hyper/studio')).toBe('/hyper/studio')
    })
})
