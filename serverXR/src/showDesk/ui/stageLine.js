// The Show desk's stage line (2026-11-01, plan S11; gaps G04, G11, G25): ONE line of text that says how the stage machine
// is — the stage watch (USB floods, heat), the link, the laser's safety state (S12's fields when they are there) and
// whether the controller was heard (S14's field when it is there). Its whole story is in the line's title (hover).
// It only reads GET ../show-status every 5 s (serverXR/src/stage/showStatus.js); it never posts and moves nothing.
// It stays hidden on a server without that route, so an older serverXR shows the page exactly as before.
(function (root, factory) {
    const api = factory()
    if (typeof module === 'object' && module.exports) module.exports = api
    else { root.diStageLine = api; if (typeof document !== 'undefined') api.start(document) }
})(typeof self !== 'undefined' ? self : this, function () {
    const POLL_MS = 5000
    const RANK = { ok: 0, off: 0, warn: 1, alert: 2 }
    const worse = (a, b) => (RANK[b] > RANK[a] ? b : a)
    const clock = (ms) => (ms ? new Date(ms).toTimeString().slice(0, 8) : '—')
    const ago = (iso, nowMs) => {
        const t = Date.parse(iso || '')
        if (!Number.isFinite(t)) return '?'
        const s = Math.max(0, Math.round((nowMs - t) / 1000))
        return s < 90 ? `${s} s` : `${Math.round(s / 60)} min`
    }

    // The line for one show-status document: { state: ok|warn|alert|off, text, title }.
    function render(d, nowMs = Date.now()) {
        if (!d || typeof d !== 'object') return { state: 'off', text: '', title: '' }
        const parts = []; const detail = []
        const w = d.watch || { state: 'off', alerts: [] }
        const alerts = Array.isArray(w.alerts) ? w.alerts : []
        let state = 'ok'
        if (w.state === 'alert' || w.state === 'warn') {
            state = w.state
            parts.push(`${w.state === 'alert' ? 'ALERT' : 'warn'} ${alerts[0] ? alerts[0].text : ''}${alerts.length > 1 ? ` (+${alerts.length - 1})` : ''}`.trim())
        } else if (w.state === 'off') { state = 'off'; parts.push('watch off') } else if (w.state === 'stale') { state = 'warn'; parts.push(`watch silent ${w.age_s ?? '?'} s`) } else parts.push('stage ok')
        detail.push(`stage watch: ${w.state}${w.at ? ' at ' + clock(Date.parse(w.at)) : ''}${w.usb_mode ? ', USB ' + w.usb_mode : ''}`)
        for (const a of alerts) detail.push(`  ${a.level}: ${a.text}`)
        const h = d.heat || {}
        if (Number.isFinite(h.max_c)) { parts.push(`${Math.round(h.max_c)}°`); detail.push(`heat: ${h.max_c} °C${Number.isFinite(h.crit_c) ? ' (crit ' + h.crit_c + ')' : ''}, ${h.state}`) }
        const l = d.link || {}
        if (l.state && l.state !== 'unknown') {
            parts.push(`link ${l.state === 'ok' && l.tailscale === 'derp' ? 'derp' : l.state}`)
            state = worse(state === 'off' ? 'ok' : state, l.state === 'lost' ? 'alert' : l.state === 'degraded' ? 'warn' : 'ok')
            detail.push(`link: ${l.state}; gateway ${Number.isFinite(l.gateway_ms) ? l.gateway_ms + ' ms' : 'no answer'}, DNS ${l.dns_ok === false ? 'failed' : l.dns_ok ? 'ok' : '?'}, tailscale ${l.tailscale ?? '—'}${Number.isFinite(l.handshake_age_s) ? ', handshake ' + l.handshake_age_s + ' s ago' : ''}`)
        }
        const z = d.laser || {}
        if (z.seen) {
            // The desk's own words for the same state (its pill, show.js: "Laser On" / "Laser Off"), so one screen never says
            // "armed" beside "Off". S12's safety words may rename both together.
            if (z.stop_reason) { parts.push(`laser stop: ${z.stop_reason}`); state = worse(state === 'off' ? 'ok' : state, 'warn') } else if (z.armed) parts.push('laser on')
            detail.push(`laser: ${z.armed ? 'On (cubes armed)' : 'Off'}${z.sim ? ' (simulation)' : ''}, ${z.connected}/${z.cubes} cubes answer${z.stop_reason ? ', stopped: ' + z.stop_reason : ''}${Number.isFinite(z.stops_total) ? ', stops ' + z.stops_total : ''}`)
        }
        const c = d.controller || {}
        if (c.wired) {
            if (c.seen === false) { parts.push('controller not heard'); state = worse(state === 'off' ? 'ok' : state, 'warn') } else if (c.heard_at) parts.push(`controller ${ago(c.heard_at, nowMs)}`)
            detail.push(`controller${c.name ? ' ' + c.name : ''}: ${c.seen === false ? 'not heard' : c.heard_at ? 'heard ' + ago(c.heard_at, nowMs) + ' ago' : '?'}`)
        }
        if (d.last_change) detail.push(`last change: ${clock(Date.parse(d.last_change.at))} (${(d.last_change.what || []).join(', ')})`)
        const p = d.push || {}
        detail.push(`to the door: ${p.enabled ? (p.failures ? `${p.failures} sends failed (${p.last_error})` : `ok${p.last_ok_at ? ' at ' + clock(Date.parse(p.last_ok_at)) : ''}`) : 'off'}`)
        return { state, text: parts.join(' · '), title: detail.join('\n') }
    }

    function start(doc, { url = '../show-status', fetchImpl = (typeof fetch === 'function' ? fetch.bind(root0()) : null), everyMs = POLL_MS, now = () => Date.now(), schedule = (fn, ms) => setTimeout(fn, ms) } = {}) {
        const el = doc.getElementById('stageLine')
        if (!el || !fetchImpl) return null
        let answered = false; let lastOkAt = null; let gone = false
        const paint = (r) => { el.hidden = !r.text; el.textContent = r.text; el.title = r.title; el.dataset.state = r.state }
        const tick = async () => {
            try {
                const res = await fetchImpl(url, { cache: 'no-store' })
                if (res.status === 404 && !answered) { gone = true; el.hidden = true; return }
                if (!res.ok) throw new Error(String(res.status))
                const d = await res.json()
                answered = true; lastOkAt = now()
                paint(render(d, lastOkAt))
            } catch {
                if (answered) paint({ state: 'alert', text: `stage status: no answer since ${clock(lastOkAt)}`, title: `GET ${url} did not answer` })
            }
        }
        const loop = async () => { if (!doc.hidden) await tick(); if (!gone) schedule(loop, everyMs) }
        loop()
        return { tick }
    }
    function root0() { return typeof self !== 'undefined' ? self : globalThis }

    return { render, start, POLL_MS }
})
