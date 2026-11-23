// The laser desk's layout choice: Grid (the default) or Classic, kept per browser.
//
// Why (2026-10-31, Projector Room, the owner: "fix the laser desk: the place is not used right, the windows inside are managed not right, it is ugly
// and not logical"): Classic showed 7 of 79 looks and put Edit on a second screen. Grid shows 27 at 1280x700 and every Edit group at rest. Classic is
// kept whole as a mode (nothing we have is ever lost); this file only decides which one the page wears. Everything else is CSS: html[data-layout="grid"]
// rules at the end of desk.css, in one size query; below 1000x600, or when this script did not load, the page is Classic.
//
// Which one: ?layout=grid|classic (a valid one wins and is kept) > the choice kept in this browser (localStorage "diLaserDeskLayout") > DEFAULT.
// DEFAULT is the lead's call under "a new default only by the owner's word": Grid; set it to 'classic' to ship the old look first.
// A click on a .layoutswitch button keeps the choice, sets html[data-layout], aria-pressed and .is-on, then fires a window 'resize' so the tiles redraw
// (desk.js redraws them on resize). Loaded in <head> before the stylesheet, so the first paint is already in the right layout; clicks are delegated for
// the same reason (the buttons do not exist yet). All storage is in try/catch: private windows and blocked storage fall back to DEFAULT.
// Loaded by the page as a plain script (window.DiLaserLayout) and by its test as a CommonJS module.
'use strict'
;((root, factory) => {
    const api = factory()
    if (typeof module === 'object' && module.exports) module.exports = api
    else {
        root.DiLaserLayout = api
        api.start(root)
    }
})(typeof window !== 'undefined' ? window : globalThis, () => {
    const KEY = 'diLaserDeskLayout'
    const LAYOUTS = ['grid', 'classic']
    const DEFAULT = 'grid'

    const normalise = (value) => (LAYOUTS.includes(value) ? value : null)

    const readStored = (win) => {
        try { return normalise(win.localStorage.getItem(KEY)) } catch { return null }
    }
    const keep = (win, layout) => {
        try { win.localStorage.setItem(KEY, layout) } catch { /* blocked storage: the choice lasts until the page is closed */ }
    }
    const fromQuery = (win) => {
        try { return normalise(new URLSearchParams(win.location.search).get('layout')) } catch { return null }
    }

    // The layout this page wears now (a valid ?layout= is kept as the choice).
    const choose = (win) => {
        const asked = fromQuery(win)
        if (asked) { keep(win, asked); return asked }
        return readStored(win) || DEFAULT
    }

    // Wear a layout: the attribute the stylesheet reads, and the switch's two buttons (when they exist yet).
    const apply = (win, layout) => {
        const doc = win.document
        doc.documentElement.setAttribute('data-layout', layout)
        for (const button of doc.querySelectorAll('.layoutswitch [data-layout]')) {
            const on = button.getAttribute('data-layout') === layout
            button.setAttribute('aria-pressed', String(on))
            button.classList.toggle('is-on', on)
        }
    }

    // The words the Grid layout may clip (an ellipsis, a line clamp) stay whole in a title: each of these notes is its own title, kept in step as desk.js rewrites it.
    const CLIPPED = ['liveName', 'cubeNote', 'sceneNote']
    const mirrorTitles = (win) => {
        for (const id of CLIPPED) {
            const el = win.document.getElementById(id)
            if (!el || typeof win.MutationObserver !== 'function') continue
            const sync = () => { el.title = el.textContent || '' }
            sync()
            new win.MutationObserver(sync).observe(el, { childList: true, characterData: true, subtree: true })
        }
    }

    const start = (win) => {
        apply(win, choose(win))
        const doc = win.document
        doc.addEventListener('click', (event) => {
            const button = event.target && event.target.closest ? event.target.closest('.layoutswitch [data-layout]') : null
            const layout = button ? normalise(button.getAttribute('data-layout')) : null
            if (!layout) return
            keep(win, layout)
            apply(win, layout)
            win.dispatchEvent(new win.Event('resize'))
        })
        const arrived = () => { apply(win, normalise(doc.documentElement.getAttribute('data-layout')) || DEFAULT); mirrorTitles(win) }
        if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', arrived)
        else mirrorTitles(win)
    }

    return { KEY, LAYOUTS, DEFAULT, CLIPPED, normalise, readStored, keep, choose, apply, mirrorTitles, start }
})
