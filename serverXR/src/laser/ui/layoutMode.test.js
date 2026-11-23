// The laser desk's layout choice (ui/layoutMode.js): Grid (the default) or Classic, kept per browser, ?layout= first, never failing on blocked storage.
// Each case builds its own jsdom window, so no choice leaks from one case to the next.
import { createRequire } from 'node:module'
import { JSDOM } from 'jsdom'
import { describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const layout = require('./layoutMode.js')

const SWITCH = '<div class="layoutswitch" role="group" aria-label="Layout"><button type="button" data-layout="grid" aria-pressed="false">Grid</button><button type="button" data-layout="classic" aria-pressed="false">Classic</button></div>'
// A window at /serverXR/laser/ + search, optionally with a stored choice and the switch markup (or none, as when the script runs in <head>).
const windowAt = ({ search = '', stored, withSwitch = true } = {}) => {
    const dom = new JSDOM(`<!doctype html><html><head></head><body>${withSwitch ? SWITCH : ''}</body></html>`, { url: `http://127.0.0.1:4379/serverXR/laser/${search}` })
    if (stored !== undefined) dom.window.localStorage.setItem(layout.KEY, stored)
    return dom.window
}
const worn = (win) => win.document.documentElement.getAttribute('data-layout')
const kept = (win) => win.localStorage.getItem(layout.KEY)

describe('the default and the two layouts', () => {
    it('Grid is the default (one constant); Grid and Classic are the only layouts; anything else is not a layout', () => {
        expect(layout.DEFAULT).toBe('grid')
        expect(layout.LAYOUTS).toEqual(['grid', 'classic'])
        expect(layout.KEY).toBe('diLaserDeskLayout')
        for (const odd of [null, undefined, '', 'GRID', 'Classic', 'rows', 'wide', 7, {}]) expect(layout.normalise(odd)).toBeNull()
        expect(layout.normalise('grid')).toBe('grid')
        expect(layout.normalise('classic')).toBe('classic')
    })
    it('a browser with nothing kept and no ?layout= wears the default, and keeps nothing', () => {
        const win = windowAt()
        layout.start(win)
        expect(worn(win)).toBe('grid')
        expect(kept(win)).toBeNull()
        expect(win.document.querySelector('.layoutswitch [data-layout=grid]').getAttribute('aria-pressed')).toBe('true')
        expect(win.document.querySelector('.layoutswitch [data-layout=classic]').getAttribute('aria-pressed')).toBe('false')
    })
})

describe('which layout wins: a valid ?layout= > the choice kept in this browser > the default', () => {
    it('the kept choice beats the default', () => {
        const win = windowAt({ stored: 'classic' })
        layout.start(win)
        expect(worn(win)).toBe('classic')
    })
    it('a valid ?layout= beats the kept choice and becomes the kept choice', () => {
        const win = windowAt({ search: '?layout=grid', stored: 'classic' })
        layout.start(win)
        expect(worn(win)).toBe('grid')
        expect(kept(win)).toBe('grid')
        const other = windowAt({ search: '?layout=classic' })
        layout.start(other)
        expect(worn(other)).toBe('classic')
        expect(kept(other)).toBe('classic')
    })
    it('a bad ?layout= or a bad kept value is ignored, never trusted and never stored', () => {
        const badQuery = windowAt({ search: '?layout=wide', stored: 'classic' })
        layout.start(badQuery)
        expect(worn(badQuery)).toBe('classic')
        expect(kept(badQuery)).toBe('classic')
        const badStored = windowAt({ stored: 'wide' })
        layout.start(badStored)
        expect(worn(badStored)).toBe('grid')
        const empty = windowAt({ search: '?layout=' })
        layout.start(empty)
        expect(worn(empty)).toBe('grid')
        expect(kept(empty)).toBeNull()
    })
})

describe('the switch', () => {
    it('a click keeps the choice, sets html[data-layout], aria-pressed and .is-on, and fires one window resize (the tiles redraw on it)', () => {
        const win = windowAt()
        layout.start(win)
        let resizes = 0
        win.addEventListener('resize', () => { resizes++ })
        win.document.querySelector('.layoutswitch [data-layout=classic]').click()
        expect(worn(win)).toBe('classic')
        expect(kept(win)).toBe('classic')
        expect(win.document.querySelector('.layoutswitch [data-layout=classic]').getAttribute('aria-pressed')).toBe('true')
        expect(win.document.querySelector('.layoutswitch [data-layout=grid]').getAttribute('aria-pressed')).toBe('false')
        expect(win.document.querySelector('.layoutswitch [data-layout=classic]').classList.contains('is-on')).toBe(true)
        expect(win.document.querySelector('.layoutswitch [data-layout=grid]').classList.contains('is-on')).toBe(false)
        expect(resizes).toBe(1)
        win.document.querySelector('.layoutswitch [data-layout=grid]').click()
        expect(worn(win)).toBe('grid')
        expect(kept(win)).toBe('grid')
        expect(resizes).toBe(2)
    })
    it('a click anywhere else does nothing: no resize, no change', () => {
        const win = windowAt()
        layout.start(win)
        let resizes = 0
        win.addEventListener('resize', () => { resizes++ })
        win.document.body.click()
        win.document.querySelector('.layoutswitch').click()
        expect(resizes).toBe(0)
        expect(worn(win)).toBe('grid')
        expect(kept(win)).toBeNull()
    })
    it('it works from <head>: the script runs before the switch exists, the click is delegated, and the buttons take their state when they arrive', () => {
        const win = windowAt({ withSwitch: false, stored: 'classic' })
        layout.start(win)
        expect(worn(win)).toBe('classic')
        win.document.body.insertAdjacentHTML('beforeend', SWITCH)
        win.document.querySelector('.layoutswitch [data-layout=grid]').click()
        expect(worn(win)).toBe('grid')
        expect(kept(win)).toBe('grid')
        expect(win.document.querySelector('.layoutswitch [data-layout=grid]').getAttribute('aria-pressed')).toBe('true')
    })
})

describe('blocked storage never stops the page', () => {
    it('storage that throws on every access: the default is worn, a click still switches for this visit, nothing throws', () => {
        const win = windowAt()
        Object.defineProperty(win, 'localStorage', { configurable: true, get() { throw new win.DOMException('blocked', 'SecurityError') } })
        expect(() => layout.start(win)).not.toThrow()
        expect(worn(win)).toBe('grid')
        expect(() => win.document.querySelector('.layoutswitch [data-layout=classic]').click()).not.toThrow()
        expect(worn(win)).toBe('classic')
        expect(win.document.querySelector('.layoutswitch [data-layout=classic]').getAttribute('aria-pressed')).toBe('true')
    })
    it('storage that refuses a write (full or private): the choice is worn, the write fails quietly', () => {
        const win = windowAt({ search: '?layout=classic' })
        win.Storage.prototype.setItem = () => { throw new win.DOMException('full', 'QuotaExceededError') }
        expect(() => layout.start(win)).not.toThrow()
        expect(worn(win)).toBe('classic')
        expect(() => win.document.querySelector('.layoutswitch [data-layout=grid]').click()).not.toThrow()
        expect(worn(win)).toBe('grid')
    })
})
