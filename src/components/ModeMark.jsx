import { useEffect, useState } from 'react'
import './modeMark.css'
import { hasServerApi } from '../services/apiClient.js'
import { getServerConfig } from '../services/serverSpaces.js'
import { deployModeMark, resolveDeployMode } from '../utils/deployMode.js'
import { isPreviewRequest } from '../utils/previewMode.js'

// Renders on every surface (mounted once in RootApp) — Studio, Raw, a space,
// the landing page, the wiki. The whole value is that there is nowhere in
// di.iiii you can be standing and not know which one you are standing in.

// How long the chip spells itself out before the frame alone carries the
// answer. Long enough to read on arrival, short enough that it is never the
// thing sitting on top of a page's own bottom-corner controls.
const CHIP_VISIBLE_MS = 4000

export default function ModeMark() {
    const [serverLocal, setServerLocal] = useState(null)
    const [collapsed, setCollapsed] = useState(false)

    useEffect(() => {
        // Same reasoning as the config fetch below: this overlay sits above the
        // whole app, so even a state-setter timer must not be the thing that
        // can throw and take a surface down with it.
        try {
            const timer = window.setTimeout(() => setCollapsed(true), CHIP_VISIBLE_MS)
            return () => window.clearTimeout(timer)
        } catch {
            return undefined
        }
    }, [])

    useEffect(() => {
        if (!hasServerApi) return undefined
        let alive = true
        // /api/config, never /api/auth/session: learning where you are must not
        // mint a guest session for a visitor who only opened a public space.
        //
        // try/catch around the call itself, not just .catch(): this overlay is
        // mounted above the whole app, so anything it throws synchronously
        // takes every surface down with it. A decorative mark that can kill
        // di.iiii is worse than no mark — the hostname alone is already a
        // correct answer almost everywhere.
        try {
            Promise.resolve(getServerConfig())
                .then((config) => { if (alive) setServerLocal(Boolean(config?.local)) })
                .catch(() => { /* the address bar already answered; a dead server changes nothing */ })
        } catch { /* same */ }
        return () => { alive = false }
    }, [])

    if (typeof window === 'undefined') return null
    // Space cards render the app in an iframe as a thumbnail (?preview=1), and
    // a published page can be embedded in someone else's site. A frame drawn
    // around either is chrome inside a picture, not an answer to a question.
    if (isPreviewRequest() || window.self !== window.top) return null

    const mode = resolveDeployMode({ hostname: window.location.hostname, local: serverLocal })
    const mark = deployModeMark(mode)
    if (!mark) return null

    return (
        <div className="mode-mark" data-mode={mode} data-collapsed={collapsed} style={{ '--mode-color': mark.color }}>
            <div className="mode-mark-frame">
                <span className="mode-mark-corner" />
            </div>
            <div className="mode-mark-chip" title={`di.iiii — ${mark.note}`}>
                <span className="mode-mark-dot" />
                <span>{mark.label}</span>
                <span className="mode-mark-host">{window.location.host}</span>
            </div>
        </div>
    )
}
