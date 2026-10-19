// The view page's chrome in di.iiii's own tokens (src/styles/base.css) and the Studio's type scale — one place, so a
// chip, a panel and a brick cannot drift apart again. Every value is a base.css custom property with the old literal as
// its fallback (the viewer can mount before the stylesheet in a test). Rectangles: --di-radius is 2 px.
//   colours  --di-scrim / --di-scrim-strong (glass) · --di-cyan-border (line) · --di-cyan (active) · --di-text / --di-text-muted
//   type     --di-sans · --di-text-3 (12 px: chip text) · --di-text-2 (10 px: label) · --di-label-tracking (labels)
//   space    --di-space-1..3 (3 / 7 / 12 px) · --di-touch-target (44 px)
export const GLASS = 'var(--di-scrim, rgba(4, 6, 14, 0.74))'
export const GLASS_STRONG = 'var(--di-scrim-strong, rgba(4, 6, 14, 0.9))'
export const LINE = 'var(--di-cyan-border, rgba(77, 249, 255, 0.3))'
export const ACTIVE = 'var(--di-cyan, #4df9ff)'
export const ACTIVE_WASH = 'var(--di-cyan-dim, rgba(77, 249, 255, 0.1))'
export const INK = 'var(--di-text, #fff)'
export const INK_DIM = 'var(--di-text-muted, rgba(255, 255, 255, 0.5))'
export const TARGET = 'var(--di-touch-target, 44px)'

/** A small chip: glass, one line, the touch target tall. The base of every button on the view page. */
export const CHIP = {
    appearance: 'none',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 'var(--di-space-2, 7px)',
    minHeight: TARGET,
    minWidth: TARGET,
    padding: '0 var(--di-space-3, 12px)',
    border: `1px solid ${LINE}`,
    borderRadius: '2px',
    background: GLASS,
    backdropFilter: 'blur(12px)',
    color: INK,
    fontFamily: 'var(--di-sans, system-ui, sans-serif)',
    fontSize: 'var(--di-text-3, 0.76rem)',
    fontWeight: 600,
    letterSpacing: 'var(--di-label-tracking, 0.16em)',
    textTransform: 'uppercase',
    textDecoration: 'none',
    whiteSpace: 'nowrap',
    cursor: 'pointer',
    flex: '0 0 auto'
}

/** The panel a chip opens, hung under it. */
export const PANEL = {
    position: 'absolute',
    top: 'calc(100% + var(--di-space-1, 3px))',
    left: 0,
    width: 'max-content',
    minWidth: 'min(22rem, calc(100vw - 2rem))',
    maxWidth: 'calc(100vw - 2rem)',
    maxHeight: '60vh',
    overflowY: 'auto',
    borderRadius: '2px',
    border: `1px solid ${LINE}`,
    background: GLASS_STRONG,
    backdropFilter: 'blur(12px)',
    color: INK,
    fontFamily: 'var(--di-sans, system-ui, sans-serif)',
    fontSize: 'var(--di-text-4, 0.9rem)'
}
