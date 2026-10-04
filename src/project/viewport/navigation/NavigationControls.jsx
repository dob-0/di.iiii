import { useEffect, useState } from 'react'
import { NAVIGATION_KEYS } from './navigationMath.js'

// Home and the key card: two small buttons at the bottom right, one thumb from the edge,
// each a 44 px target around a 30 px face (the Fullscreen button's own dress). The card lists
// the keys — Blender's, for a hand that knows Blender — and opens on `?`.

const hit = (bottom) => ({
    position: 'absolute',
    right: 7,
    bottom,
    zIndex: 10,
    width: 44,
    height: 44,
    padding: 0,
    border: 0,
    background: 'transparent',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    pointerEvents: 'auto',
    touchAction: 'manipulation'
})
const face = {
    width: 30,
    height: 30,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'rgba(15,23,34,0.55)',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 6,
    color: 'rgba(255,255,255,0.7)',
    backdropFilter: 'blur(6px)',
    fontSize: 13,
    fontWeight: 700,
    fontFamily: 'inherit'
}
const card = {
    position: 'absolute',
    right: 14,
    bottom: 176,
    zIndex: 30,
    width: 'min(380px, calc(100vw - 28px))',
    maxHeight: 'calc(100% - 200px)',
    overflowY: 'auto',
    padding: '12px 14px',
    borderRadius: 10,
    border: '1px solid rgba(255,255,255,0.14)',
    background: 'rgba(10,16,24,0.92)',
    backdropFilter: 'blur(12px)',
    color: '#e8eef5',
    fontSize: 13,
    lineHeight: 1.35,
    pointerEvents: 'auto'
}

export default function NavigationControls({ onHome, help = true, bottom = 72 }) {
    const [open, setOpen] = useState(false)
    useEffect(() => {
        if (!help) return undefined
        const onKey = (e) => {
            const t = e.target
            if (t && (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable)) return
            if (e.key === '?') { setOpen((v) => !v); return }
            if (e.key === 'Escape') setOpen(false)
        }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
    }, [help])
    return (
        <>
            <button type="button" style={hit(bottom)} onClick={onHome} title="Back to the opening view (Home)" aria-label="Home view" data-nav-home>
                <span style={face}>
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M2 8 8 2.5 14 8M3.8 7v6.5h3V10h2.4v3.5h3V7" />
                    </svg>
                </span>
            </button>
            {help ? (
                <button type="button" style={hit(bottom + 46)} onClick={() => setOpen((v) => !v)} title="Navigation keys (?)" aria-label="Navigation keys" aria-expanded={open} data-nav-help>
                    <span style={face}>?</span>
                </button>
            ) : null}
            {help && open ? (
                <div role="dialog" aria-label="Navigation keys" style={{ ...card, bottom: bottom + 96 }} data-nav-card>
                    <div style={{ fontWeight: 700, marginBottom: 6 }}>Moving around</div>
                    <table style={{ borderCollapse: 'collapse', width: '100%' }}>
                        <tbody>
                            {NAVIGATION_KEYS.map(([key, what]) => (
                                <tr key={key}>
                                    <td style={{ padding: '2px 10px 2px 0', whiteSpace: 'nowrap', verticalAlign: 'top', color: '#9fd8ee' }}>{key}</td>
                                    <td style={{ padding: '2px 0', opacity: 0.9 }}>{what}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    <div style={{ marginTop: 8, opacity: 0.6, fontSize: 12 }}>Blender&apos;s viewport keys, on purpose.</div>
                </div>
            ) : null}
        </>
    )
}
