// The view switcher: the six presets and X-ray, one quiet row.
//
// Two dresses, both borrowed, none new (feedback: preserve the existing UI):
//   'visitor' — the published room's own chrome: the rig's version row
//               (src/rigbuild/RigVersionSwitch.jsx) — one pill, 44 px targets, the
//               current one filled. Bottom centre, clear of the badge (bottom-left) and
//               the fullscreen / Enter AR corner (bottom-right); on a phone, one line up.
//   'studio'  — the Studio viewport toolbar's buttons (StudioViewport.jsx TOOLBAR_BTN),
//               top centre of the pane, since the bottom already holds Navigate / Edit.

const visitorRow = (compact) => ({
    position: 'absolute',
    left: '50%',
    transform: 'translateX(-50%)',
    bottom: compact ? 'calc(1rem + 56px)' : '1rem',
    zIndex: 20,
    display: 'flex',
    gap: '2px',
    padding: '2px',
    borderRadius: '2px',
    border: '1px solid rgba(255,255,255,0.14)',
    background: 'rgba(10, 16, 24, 0.82)',
    backdropFilter: 'blur(12px)',
    maxWidth: compact ? 'calc(100vw - 2rem)' : 'calc(100vw - 9rem)',
    overflowX: 'auto',
    scrollbarWidth: 'none',
    pointerEvents: 'auto'
})

const visitorButton = (current) => ({
    appearance: 'none',
    border: 0,
    display: 'inline-flex',
    alignItems: 'center',
    minHeight: '44px',
    minWidth: '44px',
    justifyContent: 'center',
    padding: '0 0.8rem',
    borderRadius: '2px',
    fontSize: '0.9rem',
    fontFamily: 'inherit',
    whiteSpace: 'nowrap',
    cursor: 'pointer',
    color: current ? '#05070a' : '#f5f7fa',
    background: current ? '#f5f7fa' : 'transparent'
})

const studioRow = {
    position: 'absolute',
    top: 10,
    left: '50%',
    transform: 'translateX(-50%)',
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    zIndex: 10,
    pointerEvents: 'auto'
}

// The same numbers as StudioViewport's TOOLBAR_BTN / TOOLBAR_BTN_ACTIVE_STRONG.
// Rectangles, 0-2 px (golden rule); a 44 px target at phone width (`compact`).
const studioButton = (current, compact = false) => ({
    display: 'inline-flex',
    alignItems: 'center',
    padding: '5px 9px',
    borderRadius: '2px',
    ...(compact ? { minHeight: '44px', padding: '0 12px' } : {}),
    border: current ? '1px solid #4fd6ff' : '1px solid rgba(255,255,255,0.12)',
    background: current ? 'rgba(79,214,255,0.28)' : 'rgba(15,23,34,0.82)',
    color: current ? '#4fd6ff' : '#c8d8e8',
    boxShadow: current ? '0 0 8px rgba(79,214,255,0.35)' : 'none',
    fontSize: '12px',
    fontWeight: 600,
    fontFamily: 'inherit',
    cursor: 'pointer',
    backdropFilter: 'blur(8px)',
    userSelect: 'none',
    whiteSpace: 'nowrap'
})

export default function SmartViewBar({ presets = [], activeId = null, xray = false, onPreset, onXray, variant = 'visitor', compact = false }) {
    if (!presets.length) return null
    const studio = variant === 'studio'
    const button = studio ? (current) => studioButton(current, compact) : visitorButton
    return (
        <div role="toolbar" aria-label="views" style={studio ? studioRow : visitorRow(compact)} data-smart-view-bar>
            {presets.map((p) => (
                <button
                    key={p.id}
                    type="button"
                    aria-pressed={activeId === p.id}
                    title={`${p.title} (${p.key})`}
                    style={button(activeId === p.id)}
                    onClick={() => onPreset?.(p.id)}
                >
                    {p.label}
                </button>
            ))}
            <button
                type="button"
                aria-pressed={xray}
                title="X-ray — the building ghosted, the rig solid (Alt+Z)"
                style={button(xray)}
                onClick={() => onXray?.(!xray)}
            >
                X-ray
            </button>
        </div>
    )
}
