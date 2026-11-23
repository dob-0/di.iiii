// Pure parts of the navigation audit (scripts/ui/nav-audit.mjs): kept apart so a unit test can load them without a browser.

// A control whose name matches is NEVER clicked: it may change data, send, fire a laser or leave the session.
export const SKIP_WORDS = /delete|remove|publish|send|apply|merge|reset|wipe|sign out|log out|carry|deploy|arm|fire|laser|dmx|upload|import|restore|stop|kill|shutdown/i

export function isSkipped(name) {
    return SKIP_WORDS.test(String(name || ''))
}

// A visible way back: a control named Back / Close / Desk / x, or with an aria-label that says close or back.
export const BACK_NAME = /^(?:[x\u00d7\u2715\u2716\u2190]|(?:go )?back|close|done|desk|exit|leave full screen)(?:\s|$)|\b(?:close|back)\b/i

export function looksLikeBack(name) {
    const n = String(name || '').trim()
    return n.length > 0 && n.length <= 40 && BACK_NAME.test(n)
}

// State of a view: url + a landmark fingerprint (headings, dialogs, selected tabs, full screen).
export function fingerprint(snap) {
    const s = snap || {}
    return JSON.stringify([
        s.path || '',
        s.hash || '',
        (s.headings || []).slice(0, 8),
        (s.dialogs || []).slice(0, 4),
        (s.selected || []).slice(0, 6),
        s.fullscreen ? 1 : 0
    ])
}

export function sameState(a, b) {
    return fingerprint(a) === fingerprint(b)
}

// Did the click go somewhere? URL changed, an overlay opened, or the main view swapped.
export function classifyChange(before, after) {
    if (!before || !after) return null
    if (before.path !== after.path || before.hash !== after.hash) return 'url'
    if ((after.dialogs || []).length > (before.dialogs || []).length) return 'overlay'
    if (!!after.fullscreen !== !!before.fullscreen) return 'fullscreen'
    if (sameState(before, after)) return null
    return 'view'
}

// Back: after goBack the page must be the before-state; an about:blank or other-origin page means it left the app.
export function backVerdict(before, afterBack, origin) {
    if (!afterBack || afterBack.url === 'about:blank' || (afterBack.origin && afterBack.origin !== origin)) return { ok: false, why: 'left the app' }
    if (sameState(before, afterBack)) return { ok: true, why: '' }
    return { ok: false, why: 'Back went to a different view' }
}

export function summarise(rows) {
    const by = {}
    const add = (route) => (by[route] ||= { controls: 0, backFails: 0, noVisibleBack: 0, escFails: 0 })
    const total = { controls: 0, backFails: 0, noVisibleBack: 0, escFails: 0 }
    for (const r of rows) {
        const t = add(r.page)
        for (const x of [t, total]) {
            x.controls += 1
            if (!r.backOk) x.backFails += 1
            if (!r.visibleBack) x.noVisibleBack += 1
            if (r.escOk === false) x.escFails += 1
        }
    }
    return { total, by }
}
