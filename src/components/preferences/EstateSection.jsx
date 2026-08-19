import { useCallback, useEffect, useState } from 'react'
import { getEstateMap, hasServerApi } from '../../services/apiClient.js'
import { MetricCard, ModuleSection } from './PreferencesShared.jsx'

// The estate map — every machine, address and store the studio owns — is
// authored in the PRIVATE di-atlas repo. di.iiii is public, so the file is never
// committed here and never dropped into public/; the server reads it from
// ESTATE_MAP_PATH and serves it to admins only.
//
// It is rendered in a fully sandboxed iframe with NO allow- tokens at all:
// scripts, forms, popups and same-origin access are every one of them off. The
// map is pure HTML/CSS/SVG with no <script> and no inline handlers, so nothing
// is lost by that, and a future edit that adds script silently fails to run
// rather than silently gaining the admin page's origin.

const formatBytes = (bytes) => {
    const n = Number(bytes)
    if (!Number.isFinite(n) || n <= 0) return '—'
    if (n < 1024) return `${n} B`
    if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`
    return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

const formatWhen = (iso) => {
    if (!iso) return '—'
    const at = new Date(iso)
    return Number.isNaN(at.getTime()) ? '—' : at.toISOString().slice(0, 10)
}

// The map is theme-aware and defaults to the *viewer's OS* — which lands a
// white page inside a console that is always dark, for anyone whose system is
// set to light. It honours `data-theme` on the root, and since the html passes
// through here as a string we can simply say which one before framing it.
// Wrapping is also what makes it a document rather than a fragment: the file is
// authored to be wrapped (it opens at <title>, with no <html> of its own).
export const asDarkDocument = (html = '') =>
    `<!doctype html><html lang="en" data-theme="dark">${html}</html>`

export default function EstateSection() {
    const [state, setState] = useState({ status: 'idle', map: null, error: null })

    const load = useCallback(async () => {
        if (!hasServerApi) {
            setState({ status: 'error', map: null, error: { kind: 'no-server' } })
            return
        }
        setState((prev) => ({ ...prev, status: 'loading' }))
        try {
            const map = await getEstateMap()
            setState({ status: 'ready', map, error: null })
        } catch (error) {
            // 404 is the ordinary state on a host that was never given the file —
            // it is a deployment fact, not a failure, and reads differently.
            const kind = error?.status === 404 ? 'absent' : 'failed'
            setState({ status: 'error', map: null, error: { kind, message: error?.message } })
        }
    }, [])

    useEffect(() => { load() }, [load])

    const { status, map, error } = state

    return (
        <ModuleSection
            title="Estate"
            subtitle="Every machine, address and store — read from the private atlas, admin only"
            actions={(
                <button type="button" className="toggle-button" onClick={load} disabled={status === 'loading'}>
                    {status === 'loading' ? 'Loading…' : 'Reload'}
                </button>
            )}
        >
            {status === 'ready' && map ? (
                <>
                    <div className="preferences-status-grid">
                        <MetricCard label="Source" value={map.name || 'estate-map.html'} />
                        <MetricCard label="Updated" value={formatWhen(map.updatedAt)} />
                        <MetricCard label="Size" value={formatBytes(map.bytes)} />
                    </div>
                    <iframe
                        title="Estate map"
                        className="preferences-estate-frame"
                        sandbox=""
                        srcDoc={asDarkDocument(map.html)}
                    />
                </>
            ) : null}

            {status === 'error' && error?.kind === 'absent' ? (
                <p className="preferences-empty">
                    No map on this host. It is written in the private <code>di-atlas</code> repo and placed here out of
                    band — set <code>ESTATE_MAP_PATH</code> to <code>map/estate-map.html</code> from that checkout.
                </p>
            ) : null}

            {status === 'error' && error?.kind === 'no-server' ? (
                <p className="preferences-empty">No server API configured, so there is nothing to read the map from.</p>
            ) : null}

            {status === 'error' && error?.kind === 'failed' ? (
                <p className="preferences-empty">Could not read the map — {error.message || 'unknown error'}.</p>
            ) : null}

            {status === 'loading' ? <p className="preferences-empty">Reading the atlas…</p> : null}
        </ModuleSection>
    )
}
