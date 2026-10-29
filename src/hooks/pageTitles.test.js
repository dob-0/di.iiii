import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { pageTitle, PAGE_TITLES } from './pageTitles.js'

const here = dirname(fileURLToPath(import.meta.url))
const read = (rel) => readFileSync(resolve(here, rel), 'utf8')
const DEFAULT_TITLE = 'di.iiii — public spaces on the open web'

describe('pageTitle: route -> tab title (F125)', () => {
    const table = [
        ['studio-spaces', {}, 'Spaces — Studio — di.iiii'],
        ['studio-hub', { space: 'hayfilm' }, 'Projects — hayfilm — Studio — di.iiii'],
        ['studio-project', { project: 'Manifesto', space: 'hayfilm' }, 'Manifesto — Studio — hayfilm — di.iiii'],
        ['studio-project', { space: 'hayfilm' }, 'Project — Studio — hayfilm — di.iiii'],
        ['studio-director', { space: 'main' }, 'Director — main — Studio — di.iiii'],
        ['chat', {}, 'Chat — di.iiii'],
        ['tools', {}, 'Tools — di.iiii'],
        ['admin', { section: 'Open call' }, 'Open call — Admin — di.iiii'],
        ['admin', {}, 'Admin — di.iiii']
    ]
    it.each(table)('%s %j', (route, parts, expected) => {
        expect(pageTitle(route, parts)).toBe(expected)
    })

    it('no route repeats another and none falls back to the index.html default', () => {
        const titles = table.map(([route, parts]) => pageTitle(route, parts))
        expect(new Set(titles).size).toBe(titles.length)
        expect(titles).not.toContain(DEFAULT_TITLE)
        expect(titles.join(' ')).not.toMatch(/undefined|null/)
    })

    it('an unknown route has no title (the page keeps its own)', () => {
        expect(pageTitle('nope')).toBeNull()
        expect(Object.keys(PAGE_TITLES)).toHaveLength(7)
    })
})

describe('every surface names itself and has one heading', () => {
    it.each([
        ['../studio/StudioApp.jsx', 'pageTitle('],
        ['../studio/components/StudioEditor.jsx', "pageTitle('studio-project'"],
        ['../chat/ChatHomeSurface.jsx', "pageTitle('chat')"],
        ['../kit/KitPage.jsx', "pageTitle('tools')"],
        ['../components/PreferencesPage.jsx', "pageTitle('admin'"]
    ])('%s sets its tab title', (file, needle) => {
        expect(read(file)).toContain(needle)
    })

    it('the Studio project view has exactly one h1 and one main region', () => {
        const src = read('../studio/components/StudioEditor.jsx')
        expect(src.match(/<h1[ >]/g)).toHaveLength(1)
        expect(src.match(/<main[ >]/g)).toHaveLength(1)
    })

    it('the Studio project view puts its h1 inside its main region', () => {
        const src = read('../studio/components/StudioEditor.jsx')
        expect(src.indexOf('<main')).toBeLessThan(src.indexOf('<h1'))
    })

    it('StudioApp adds no main of its own: each view owns exactly one', () => {
        expect(read('../studio/StudioApp.jsx')).not.toMatch(/<main[ >]/)
    })

    it('the chat home has exactly one h1 and a main region', () => {
        const src = read('../chat/ChatHomeSurface.jsx')
        expect(src.match(/component="h1"/g)).toHaveLength(1)
        expect(src).toContain('component="main"')
    })
})
