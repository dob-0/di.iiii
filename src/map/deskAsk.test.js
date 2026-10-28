import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

const ROOT = globalThis.process.cwd() // the repo root: vitest runs from it

// F042 (UX audit 2026-10-28): the light desk asked three ways before a destructive step: a native confirm()
// (which froze the poll, the stage and the panic key), a two-step "Sure?" button, or nothing. It now asks one
// way, serverXR/src/lighting/ui/ask.js: a bar that never blocks the page. Plain script, held here like from.js.

const { createAsk } = createRequire(import.meta.url)('../../serverXR/src/lighting/ui/ask.js')
const ui = (f) => readFileSync(join(ROOT, 'serverXR/src/lighting/ui', f), 'utf8')

// a clock we move by hand
const clock = () => {
    let now = 1000; const q = []
    return {
        set: (fn, ms) => { const h = { fn, at: now + ms }; q.push(h); return h },
        clear: (h) => { const i = q.indexOf(h); if (i >= 0) q.splice(i, 1) },
        now: () => now,
        advance: (ms) => { now += ms; for (const h of [...q]) if (h.at <= now) { q.splice(q.indexOf(h), 1); h.fn() } }
    }
}
const bar = () => document.getElementById('deskAsk')
const press = (cls) => bar().querySelector(cls).click()
afterEach(() => { document.body.innerHTML = '' })

describe('deskAsk: the one way the desk asks', () => {
    it('answers yes only after the bar has had a beat on screen, and no on Cancel', async () => {
        const c = clock(); const { ask } = createAsk(document, c)
        const p = ask('Unpatch 12 fixtures?', 'Unpatch')
        expect(bar().textContent).toContain('Unpatch 12 fixtures?')
        expect(bar().querySelector('.deskask-yes').textContent).toBe('Unpatch')
        expect(document.activeElement.className).toBe('deskask-no') // a stray Enter loses nothing
        press('.deskask-yes')                                         // a double-tap, inside the guard
        expect(bar()).not.toBeNull()
        c.advance(400); press('.deskask-yes')
        expect(await p).toBe(true)
        expect(bar()).toBeNull()
        const q = ask('again?', 'OK'); press('.deskask-no')
        expect(await q).toBe(false)
    })

    it('Esc says no, ten seconds of nothing says no, and a second question replaces the first', async () => {
        const c = clock(); const { ask, isOpen } = createAsk(document, c)
        const a = ask('one?'); document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
        expect(await a).toBe(false); expect(isOpen()).toBe(false)
        const b = ask('two?'); c.advance(10001)
        expect(await b).toBe(false); expect(bar()).toBeNull()
        const d = ask('three?'); const e = ask('four?')
        expect(await d).toBe(false)
        expect(document.querySelectorAll('#deskAsk')).toHaveLength(1)
        c.advance(400); press('.deskask-yes')
        expect(await e).toBe(true)
    })

    it('works on the real timers, called as a method (a browser setTimeout throws if it is not bound)', async () => {
        const { ask } = createAsk(document)
        const p = ask('real timers?')
        press('.deskask-no')
        expect(await p).toBe(false)
    })

    it('does not touch any key but Escape (the panic key and the rest keep working)', () => {
        const c = clock(); const { ask } = createAsk(document, c)
        ask('x?')
        const ev = new KeyboardEvent('keydown', { key: 'b', cancelable: true, bubbles: true })
        document.dispatchEvent(ev)
        expect(ev.defaultPrevented).toBe(false); expect(bar()).not.toBeNull()
    })

    it('Esc stops at the bar: the desk\'s own Esc (clear the selection) does not also fire', async () => {
        const c = clock(); const { ask } = createAsk(document, c)
        let deskEsc = 0
        const desk = (e) => { if (e.key === 'Escape') deskEsc++ }
        document.addEventListener('keydown', desk)
        const p = ask('Unpatch 12 fixtures?', 'Unpatch')
        document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
        expect(await p).toBe(false)
        expect(deskEsc).toBe(0)
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
        expect(deskEsc).toBe(1)                                         // closed: the desk has its Esc back
        document.removeEventListener('keydown', desk)
    })

    it('the bar is named by its question', () => {
        const { ask } = createAsk(document, clock())
        ask('Delete this look?', 'Delete')
        const id = bar().getAttribute('aria-labelledby')
        expect(document.getElementById(id).textContent).toBe('Delete this look?')
    })
})

describe('the desk has one confirm path', () => {
    const app = ui('app.js')
    const code = app.split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n')
    it('app.js has no native confirm() and no "Sure?" two-step button', () => {
        expect(code.match(/(^|[^.\w])confirm\(/g)).toBeNull()
        expect(code).not.toMatch(/armThen|Sure\?/)
    })
    it('every destructive step asks through deskAsk, and the page loads ask.js before app.js', () => {
        expect((code.match(/deskAsk\.ask\(/g) || []).length).toBe(7)  // unpatch, release others, set all, clear MIDI map, whiteout, delete set, and askThen's own
        expect((code.match(/askThen\(/g) || []).length).toBe(7)       // its definition + scene overwrite/delete (detail and popover), layer, look
        const html = ui('index.html')
        expect(html.indexOf('src="ask.js"')).toBeGreaterThan(0)
        expect(html.indexOf('src="ask.js"')).toBeLessThan(html.indexOf('src="app.js"'))
    })
})
