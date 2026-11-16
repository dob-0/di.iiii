import { describe, expect, it } from 'vitest'
import {
    ADMIN_WINDOW_KINDS,
    adminKeyAction,
    arrangeAll,
    arrangeRects,
    availableKinds,
    closeAll,
    closeWindow,
    emptyLayout,
    layoutStorageKey,
    loadLayout,
    openWindow,
    parseAdminHash,
    parseLayout,
    placeWindow,
    restrictLayout,
    saveLayout,
    toggleMaximize
} from './adminWindows.js'
import { buildTiles } from './useAdminTiles.js'

const SECTION_KEYS = ['manage', 'opencall', 'monitor', 'agents', 'visitors', 'overview', 'inspect', 'system', 'estate']
const key = (init) => ({ key: 'x', target: { tagName: 'DIV' }, ...init })

describe('the window-kind table', () => {
    it('gives every old section key a kind, with a name of at most three words and a hint', () => {
        for (const section of SECTION_KEYS) expect(ADMIN_WINDOW_KINDS.some((k) => k.key === section), section).toBe(true)
        for (const kind of ADMIN_WINDOW_KINDS) {
            expect(kind.label.split(/\s+/).length, kind.key).toBeLessThanOrEqual(3)
            expect(kind.hint.length, kind.key).toBeGreaterThan(8)
        }
        expect(new Set(ADMIN_WINDOW_KINDS.map((k) => k.key)).size).toBe(ADMIN_WINDOW_KINDS.length)
    })

    it('has no Monitor kind until the server said 200', () => {
        expect(availableKinds({ monitorAllowed: false }).some((k) => k.key === 'monitor')).toBe(false)
        expect(availableKinds({}).some((k) => k.key === 'monitor')).toBe(false)
        expect(availableKinds({ monitorAllowed: true }).some((k) => k.key === 'monitor')).toBe(true)
        expect(availableKinds({ monitorAllowed: true })).toHaveLength(ADMIN_WINDOW_KINDS.length)
    })

    it('never says workspace or lane in a name or a hint', () => {
        for (const kind of ADMIN_WINDOW_KINDS) expect(`${kind.label} ${kind.hint}`).not.toMatch(/workspace|lane/i)
    })
})

describe('old links open the window', () => {
    it('maps #section to its kind, #monitor-full to the Monitor in full, and anything else to nothing', () => {
        for (const section of SECTION_KEYS) expect(parseAdminHash(`#${section}`)).toEqual({ key: section, full: false })
        expect(parseAdminHash('#monitor-full')).toEqual({ key: 'monitor', full: true })
        expect(parseAdminHash('#log')).toEqual({ key: 'log', full: false })
        expect(parseAdminHash('#nonsense')).toBeNull()
        expect(parseAdminHash('')).toBeNull()
        expect(parseAdminHash(undefined)).toBeNull()
    })
})

describe('layout', () => {
    it('opens, raises and closes windows and tiles them without overlap', () => {
        let layout = openWindow(emptyLayout(), 'manage')
        expect(layout.rects.manage).toEqual([0, 0, 100, 100])
        layout = openWindow(layout, 'visitors')
        expect(layout.open).toEqual(['manage', 'visitors'])
        expect(layout.rects.manage).toEqual([0, 0, 50, 100])
        expect(layout.rects.visitors).toEqual([50, 0, 50, 100])
        layout = closeWindow(layout, 'manage')
        expect(layout.open).toEqual(['visitors'])
        expect(layout.rects.visitors).toEqual([0, 0, 100, 100])
        expect(closeAll().open).toEqual([])
    })

    it('keeps a hand-placed layout when another window opens, and arrange-all re-tiles it', () => {
        let layout = openWindow(openWindow(emptyLayout(), 'manage'), 'visitors')
        layout = placeWindow(layout, 'manage', [10, 10, 40, 40])
        expect(layout.manual).toBe(true)
        layout = openWindow(layout, 'log')
        expect(layout.rects.manage).toEqual([10, 10, 40, 40])
        expect(layout.rects.log).toHaveLength(4)
        layout = arrangeAll(layout)
        expect(layout.manual).toBe(false)
        const rects = arrangeRects(3)
        expect(rects).toHaveLength(3)
    })

    it('shows one window at a time on a phone and maximises on request', () => {
        let layout = openWindow(emptyLayout(), 'manage', { narrow: true })
        layout = openWindow(layout, 'agents', { narrow: true })
        expect(layout.open).toEqual(['agents'])
        expect(layout.max).toBe('agents')
        layout = openWindow(emptyLayout(), 'manage')
        expect(toggleMaximize(layout, 'manage').max).toBe('manage')
        expect(toggleMaximize(toggleMaximize(layout, 'manage'), 'manage').max).toBeNull()
    })

    it('drops a gated kind from a stored layout', () => {
        const stored = openWindow(openWindow(emptyLayout(), 'manage'), 'monitor')
        const without = restrictLayout(stored, ['manage', 'agents'])
        expect(without.open).toEqual(['manage'])
        expect(parseLayout(JSON.stringify(stored), ['manage']).open).toEqual(['manage'])
    })

    it('survives a bad stored value and a blocked storage, with no throw', () => {
        expect(parseLayout('{not json').open).toEqual([])
        expect(parseLayout(JSON.stringify({ v: 99, open: ['manage'] })).open).toEqual([])
        expect(parseLayout(JSON.stringify({ v: 1, open: ['manage', 'bogus'], rects: { manage: [1, 2] } })).open).toEqual(['manage'])
        const blocked = { getItem() { throw new Error('blocked') }, setItem() { throw new Error('blocked') } }
        expect(loadLayout('wide', null, blocked).open).toEqual([])
        expect(saveLayout('wide', emptyLayout(), blocked)).toBe(false)
    })

    it('remembers per device and per width class', () => {
        const memory = new Map()
        const storage = { getItem: (k) => (memory.has(k) ? memory.get(k) : null), setItem: (k, v) => memory.set(k, v) }
        const layout = openWindow(openWindow(emptyLayout(), 'manage'), 'log')
        expect(saveLayout('wide', layout, storage)).toBe(true)
        expect(loadLayout('wide', null, storage).open).toEqual(['manage', 'log'])
        expect(loadLayout('narrow', null, storage).open).toEqual([])
        expect(layoutStorageKey('wide')).not.toBe(layoutStorageKey('narrow'))
    })
})

describe('keys', () => {
    it('answers the desk keys and ? for the card', () => {
        expect(adminKeyAction(key({ key: '?' }))).toBe('help')
        expect(adminKeyAction(key({ key: 'm' }))).toBe('maximize')
        expect(adminKeyAction(key({ key: '/' }))).toBe('add')
        expect(adminKeyAction(key({ key: 'A', shiftKey: true }))).toBe('arrange')
        expect(adminKeyAction(key({ key: '`', ctrlKey: true }))).toBe('next')
        expect(adminKeyAction(key({ key: 'Escape' }))).toBe('escape')
    })

    it('does not fire while typing in a field, nor with a modifier, nor on repeat', () => {
        for (const tagName of ['INPUT', 'TEXTAREA', 'SELECT']) {
            expect(adminKeyAction(key({ key: 'm', target: { tagName } }))).toBeNull()
            expect(adminKeyAction(key({ key: '?', target: { tagName } }))).toBeNull()
        }
        expect(adminKeyAction(key({ key: 'm', target: { tagName: 'DIV', isContentEditable: true } }))).toBeNull()
        expect(adminKeyAction(key({ key: 'm', ctrlKey: true }))).toBeNull()
        expect(adminKeyAction(key({ key: 'm', repeat: true }))).toBeNull()
    })
})

describe('tiles', () => {
    it('shows a number or a state per kind, with a state colour and a label of at most three words', () => {
        const tiles = buildTiles({
            remote: { spaces: 2, users: 5, calls: 4, callsNew: 1, visitors: 3, agentsLive: 2, agentsTotal: 60, estate: 'ready' },
            page: { entries: [{ level: 'error' }, { level: 'info' }], managementButtons: [{ kind: 'switch', checked: true }, { kind: 'switch', checked: false }], connected: true, objectCount: 7, backendHealthStatus: 'ok' }
        })
        expect(tiles.manage.value).toBe(2)
        expect(tiles.opencall.tone).toBe('warning')
        expect(tiles.agents.tone).toBe('success')
        expect(tiles.log.tone).toBe('danger')
        expect(tiles.system.value).toBe('1/2')
        expect(tiles.build.tone).toBe('success')
        for (const [name, tile] of Object.entries(tiles)) expect(tile.word.split(/\s+/).length, name).toBeLessThanOrEqual(3)
        expect(Object.keys(tiles).sort()).toEqual(ADMIN_WINDOW_KINDS.map((k) => k.key).sort())
    })

    it('shows a dash, not a number, when a fetch failed', () => {
        expect(buildTiles().manage.value).toBe('—')
    })
})
