// The show desk's presence (serverXR/src/showDesk/ui/presence.js, 2026-10-31). The owner, 23:0x: "make colours like if someone is
// active, that is coloured around". A person touches a control on the Show desk: that control gets a ring in the colour of that
// browser, the desk's frame takes the colour of whoever is driving now, and a small list in the top line ("who is on") says which
// colour is which name. One colour per browser, the same all night; a ring fades a few seconds after the last touch.
//
// This file is the rules only: no DOM, no fetch. show.js draws and sends; presence.test.js tests this file on its own.
//   - which colour a browser is, the name it shows, how a ring fades;
//   - which headers a request carries: the page names itself on requests it already sends (X-Di-Client, X-Di-Label, and
//     X-Di-Control on a write). The server's touch board (serverXR/src/touchBoard.js) remembers the writes the desks accepted and
//     the page reads it once a second (GET api/who). Nothing here posts a claim of its own;
//   - how the board's answer and the browser's own touches become rings, a frame and the legend (compose).
// A name and an id are what a browser claims, not a login: cosmetic, never a guard.
// Loaded by the page as a plain script (window.DiPresence) and by its test as a CommonJS module.
'use strict'
;(() => {
    const SLOTS = 6 // six colours, fixed: --c0 … --c5 in show.css (never in JS)
    const HOLD_MS = 1500 // a ring keeps its full strength this long after the last touch, so a drag seen through a 1 s poll stays steady
    const GONE_MS = 4000 // … and has faded to nothing here
    const SEEN_MS = 5000 // a browser that asked the board this recently is on
    const LABEL_MAX = 12 // a name is 12 characters at most (code points)
    const ID = /^[A-Za-z0-9._:@-]{1,40}$/ // the lighting desk's own owner tag (lighting/desk.js)
    const CONTROL = /^[a-z][a-z0-9-]{0,23}(:[A-Za-z0-9._@-]{1,40})?$/ // what was touched: lamp:f1, scene:warm, blackout …
    const KEY = 'diShowDesk.who.v1' // this browser's id and name, kept in this browser

    // FNV-1a, 32 bit (Fowler, Noll, Vo; test vectors on their page). touchBoard.js carries the same function: a test keeps both equal.
    const fnv1a = (text) => {
        let h = 0x811c9dc5
        const s = String(text)
        for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0 }
        return h >>> 0
    }
    const slotOf = (id) => fnv1a(id) % SLOTS

    // phone for a phone, Mac for a Mac with at most one touch point, tab for everything else (an iPad lands in tab).
    const defaultLabel = (userAgent, touchPoints) => {
        const ua = String(userAgent || '')
        if (/iPhone|iPod|Android.*Mobile|Mobile.*Android/i.test(ua)) return 'phone'
        if (/Macintosh/i.test(ua) && !(Number(touchPoints) > 1)) return 'Mac'
        return 'tab'
    }
    // A name: NFC, no control, format (bidi) or line characters, one space between words, 12 code points at most.
    const cleanLabel = (raw) => {
        let s = String(raw === undefined || raw === null ? '' : raw)
        try { s = s.normalize('NFC') } catch { /* keep it as it came */ }
        s = s.replace(/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/gu, '').replace(/\s+/g, ' ').trim()
        return Array.from(s).slice(0, LABEL_MAX).join('').trim()
    }
    // Full strength to HOLD_MS after the last touch, a straight fade to nothing at GONE_MS.
    const ringAlpha = (ageMs) => {
        const age = Number(ageMs)
        if (!Number.isFinite(age)) return 0
        if (age <= HOLD_MS) return 1
        if (age >= GONE_MS) return 0
        return (GONE_MS - age) / (GONE_MS - HOLD_MS)
    }

    // The key of a control. An id outside the key alphabet is made safe the same way on the page and in the header, so a ring
    // never goes missing because a scene was named with a space.
    const controlKey = (kind, id) => (id === undefined || id === null || id === '' ? String(kind) : `${kind}:${String(id).replace(/[^A-Za-z0-9._@-]/g, '_').slice(0, 40)}`)

    // The headers of one request: ASCII only. No id, no headers (nothing anonymous). The control rides on a write only.
    const headersFor = ({ id, label, control, post = false } = {}) => {
        const h = {}
        if (typeof id !== 'string' || !ID.test(id)) return h
        h['X-Di-Client'] = id
        const name = cleanLabel(label)
        if (name) { try { h['X-Di-Label'] = encodeURIComponent(name) } catch { /* a lone surrogate: no name rather than a failed request */ } }
        if (post && typeof control === 'string' && CONTROL.test(control)) h['X-Di-Control'] = control
        return h
    }

    // The board's answer ({ ok, clients: [{ id, label, slot, seenMs, touchMs }], touches: [{ control, id, slot, ageMs }] }) carries
    // ages, never wall-clock times, so a phone with a wrong clock still fades right. This turns the ages into start times on THIS
    // browser's clock (`receivedAt`). Anything malformed is left out.
    const num = (v) => (Number.isFinite(Number(v)) && Number(v) >= 0 ? Number(v) : 0)
    const slotNum = (slot, id) => (Number.isInteger(slot) && slot >= 0 && slot < SLOTS ? slot : slotOf(id))
    const mergeWho = (answer, receivedAt) => {
        const out = { clients: [], touches: [] }
        if (!answer || answer.ok !== true) return out
        const t = Number(receivedAt) || 0
        for (const c of Array.isArray(answer.clients) ? answer.clients : []) {
            if (!c || typeof c.id !== 'string' || !ID.test(c.id)) continue
            out.clients.push({ id: c.id, label: cleanLabel(c.label), slot: slotNum(c.slot, c.id), seenAt: t - num(c.seenMs), touchAt: c.touchMs === null || c.touchMs === undefined ? null : t - num(c.touchMs) })
        }
        for (const x of Array.isArray(answer.touches) ? answer.touches : []) {
            if (!x || typeof x.control !== 'string' || !CONTROL.test(x.control) || typeof x.id !== 'string' || !ID.test(x.id)) continue
            out.touches.push({ control: x.control, id: x.id, slot: slotNum(x.slot, x.id), at: t - num(x.ageMs) })
        }
        return out
    }

    // What the page shows now, from the board's answer (`who`, mergeWho's output, or null: no board on this server), this
    // browser's own touches (`mine`: control → when), who this browser is (`self`: { id, name }) and the clock.
    //   rings   control → { slot, alpha }   the last toucher's colour, faded by ringAlpha
    //   driver  { slot, alpha } | null      whoever touched last within GONE_MS (own touches included)
    //   legend  the browsers on, in slot order: seen under SEEN_MS ago or touched under GONE_MS ago, this one always
    const compose = ({ who = null, mine = new Map(), self = {}, now = Date.now() } = {}) => {
        const board = who && Array.isArray(who.clients) ? who.clients.find((c) => c.id === self.id) : null
        const selfSlot = board ? board.slot : slotOf(self.id)
        const latest = new Map()
        const note = (control, at, slot) => { const cur = latest.get(control); if (!cur || at > cur.at) latest.set(control, { at, slot }) }
        if (who && Array.isArray(who.touches)) for (const t of who.touches) note(t.control, t.at, t.slot)
        let lastMine = null
        for (const [control, at] of mine) { note(control, at, selfSlot); if (lastMine === null || at > lastMine) lastMine = at }
        const rings = new Map()
        let driver = null
        for (const [control, t] of latest) {
            const alpha = ringAlpha(now - t.at)
            if (alpha > 0) rings.set(control, { slot: t.slot, alpha })
            if (alpha > 0 && (!driver || t.at > driver.at)) driver = { slot: t.slot, alpha, at: t.at }
        }
        const roster = new Map()
        if (who && Array.isArray(who.clients)) for (const c of who.clients) roster.set(c.id, { ...c })
        const me = roster.get(self.id) || { id: self.id, label: '', slot: selfSlot, seenAt: now, touchAt: null }
        me.label = self.name || me.label
        me.seenAt = now
        if (lastMine !== null && (me.touchAt === null || lastMine > me.touchAt)) me.touchAt = lastMine
        roster.set(self.id, me)
        const on = [...roster.values()]
            .filter((c) => c.id === self.id || now - c.seenAt < SEEN_MS || (c.touchAt !== null && now - c.touchAt < GONE_MS))
            .sort((a, b) => a.slot - b.slot || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
        const used = new Map()
        const legend = on.map((c) => {
            const base = c.label || 'browser'
            const n = (used.get(base.toLowerCase()) || 0) + 1
            used.set(base.toLowerCase(), n)
            return { id: c.id, slot: c.slot, name: n > 1 ? `${base} ${n}` : base, mine: c.id === self.id, driving: c.touchAt !== null && now - c.touchAt < GONE_MS }
        })
        return { rings, driver: driver ? { slot: driver.slot, alpha: driver.alpha } : null, legend, selfSlot }
    }

    // This browser's id (12 hex characters, made once) and its name, kept in storage. The name is stored only when the person set
    // one; until then it follows the default for this device. No storage: the id lasts for this page load.
    const newId = (getRandomValues) => {
        const bytes = new Uint8Array(6)
        try { (getRandomValues || ((a) => globalThis.crypto.getRandomValues(a)))(bytes) } catch { for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256) }
        return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
    }
    const saveSelf = (storage, self) => {
        try { storage.setItem(KEY, JSON.stringify({ id: self.id, label: self.label || '' })); return true } catch { return false }
    }
    const loadSelf = ({ storage = null, userAgent = '', touchPoints = 0, getRandomValues = null } = {}) => {
        let id = ''
        let label = ''
        try {
            const saved = JSON.parse(storage.getItem(KEY) || 'null')
            if (saved && ID.test(String(saved.id))) id = saved.id
            if (saved && typeof saved.label === 'string') label = cleanLabel(saved.label)
        } catch { /* nothing stored, or no storage here: made fresh below */ }
        const self = { id: id || newId(getRandomValues), label, name: '' }
        if (!id) saveSelf(storage, self)
        self.name = self.label || defaultLabel(userAgent, touchPoints)
        return self
    }

    // ?presence=0 in the address turns everything off: the page as it was before presence.
    const enabled = (search) => {
        try { return new URLSearchParams(String(search || '')).get('presence') !== '0' } catch { return true }
    }

    const api = { SLOTS, HOLD_MS, GONE_MS, SEEN_MS, LABEL_MAX, ID, CONTROL, KEY, fnv1a, slotOf, defaultLabel, cleanLabel, ringAlpha, controlKey, headersFor, mergeWho, compose, loadSelf, saveSelf, enabled }
    if (typeof module === 'object' && module.exports) module.exports = api
    if (typeof window !== 'undefined') window.DiPresence = api
})()
