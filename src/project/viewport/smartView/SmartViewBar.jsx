import { VIEW_LAYER_IDS, VIEW_LAYER_LABELS } from './smartViewGeometry.js'
// The view switcher: the project's views (viewData.js) and X-ray, one quiet row.
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
    // Never shrink: on a 390 px phone seven labels squeezed into each other ("SideRig - FOH z 29Crane");
    // the row scrolls sideways instead (overflowX on the row).
    flex: '0 0 auto',
    cursor: 'pointer',
    color: current ? '#05070a' : '#f5f7fa',
    background: current ? '#f5f7fa' : 'transparent'
})

// Below whatever the studio draws over the top of the pane: --svl-top-clear is the floating nav on desktop
// (--sbar-h) or, on a phone / tablet, the measured bottom of the context bar (StudioViewportLayout); and
// --svl-ctrl-row, set only there, drops the bar under the split-controls row instead of beside it. A bare
// top:10 put the whole bar under the nav, where every click landed on the nav (2026-10-01).
// maxWidth + scroll: seven buttons are wider than a 390px phone.
const studioRow = {
    position: 'absolute',
    top: 'calc(10px + var(--svl-top-clear, 0px) + var(--svl-ctrl-row, 0px))',
    left: '50%',
    transform: 'translateX(-50%)',
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    zIndex: 10,
    maxWidth: 'calc(100% - 16px)',
    overflowX: 'auto',
    scrollbarWidth: 'none',
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
    border: current ? '1px solid var(--di-cyan)' : '1px solid rgba(255,255,255,0.12)',
    background: current ? 'rgba(var(--di-cyan-rgb),0.28)' : 'rgba(var(--di-surface-2-rgb),0.82)',
    color: current ? 'var(--di-cyan)' : '#c8d8e8',
    boxShadow: current ? '0 0 8px rgba(var(--di-cyan-rgb),0.35)' : 'none',
    fontSize: '12px',
    fontWeight: 600,
    fontFamily: 'inherit',
    cursor: 'pointer',
    backdropFilter: 'blur(8px)',
    userSelect: 'none',
    whiteSpace: 'nowrap'
})

// The building switches (Roof · Walls · Machines · Outside) sit in this bar when `onLayer` is given — the Studio's case
// (owner 2026-10-13: "the floor is hidden but I can't see the place where I turn the walls on and off"); the visitor page
// draws its own group next to the SceneBar and passes none. `layers[id] === false` hides a layer, anything else shows it.
export default function SmartViewBar({ presets = [], activeId = null, xray = false, onPreset, onXray, variant = 'visitor', compact = false, layers = null, onLayer = null, flying = false, onFly = null }) {
    if (!presets.length) return null
    const studio = variant === 'studio'
    const button = studio ? (current) => studioButton(current, compact) : visitorButton
    return (
        <div role="toolbar" aria-label="views" style={studio ? studioRow : visitorRow(compact)} data-smart-view-bar>
            {presets.map((p) => {
                // A work view (viewData.js: `live: false`) is the Studio's only: dashed, and its title says so.
                const work = studio && p.live === false
                const title = p.key ? `${p.title} (${p.key})` : p.title
                return (
                    <button
                        key={p.id}
                        type="button"
                        aria-pressed={activeId === p.id}
                        data-live={p.live === undefined ? undefined : String(p.live)}
                        title={work ? `${title} — work view: visitors do not see it` : title}
                        style={work ? { ...button(activeId === p.id), borderStyle: 'dashed' } : button(activeId === p.id)}
                        onClick={() => onPreset?.(p.id)}
                    >
                        {p.label}
                    </button>
                )
            })}
            <button
                type="button"
                aria-pressed={xray}
                title="X-ray — the building ghosted, the rig solid (Alt+Z)"
                style={button(xray)}
                onClick={() => onXray?.(!xray)}
            >
                X-ray
            </button>
            {typeof onFly === 'function' ? (
                <button
                    type="button"
                    data-autofly
                    aria-pressed={flying}
                    title="Auto fly — an FPV drone flight through the room; touch anything to take the controls (Esc stops)"
                    style={button(flying)}
                    onClick={() => onFly(!flying)}
                >
                    Auto fly
                </button>
            ) : null}
            {typeof onLayer === 'function' ? VIEW_LAYER_IDS.map((id) => {
                const shown = layers?.[id] !== false
                return (
                    <button
                        key={id}
                        type="button"
                        aria-pressed={shown}
                        data-layer={id}
                        title={id === 'cut' ? `${shown ? 'Whole building: stop cutting' : 'Cut'} the roof and the walls that face you from outside` : `${shown ? 'Hide' : 'Show'} the ${VIEW_LAYER_LABELS[id].toLowerCase()}`}
                        style={{ ...button(shown), textDecoration: shown ? 'none' : 'line-through' }}
                        onClick={() => onLayer(id, !shown)}
                    >
                        {VIEW_LAYER_LABELS[id]}
                    </button>
                )
            }) : null}
        </div>
    )
}
