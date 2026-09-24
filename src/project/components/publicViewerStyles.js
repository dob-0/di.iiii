// Shared so the lazily-loaded scene surface can render its own overlay chrome
// without dragging PublicProjectViewer's module into the three.js chunk.
export const overlayButtonStyle = {
    appearance: 'none',
    border: '1px solid rgba(255,255,255,0.14)',
    background: 'rgba(10, 16, 24, 0.82)',
    color: '#f5f7fa',
    borderRadius: '999px',
    padding: '0.7rem 1rem',
    fontSize: '0.95rem',
    cursor: 'pointer',
    backdropFilter: 'blur(12px)'
}

export const overlayCardStyle = {
    background: 'rgba(6, 9, 13, 0.78)',
    border: '1px solid rgba(255,255,255,0.1)',
    color: '#f5f7fa',
    borderRadius: '18px',
    padding: '1rem 1.1rem',
    maxWidth: '28rem',
    boxShadow: '0 20px 60px rgba(0,0,0,0.35)',
    backdropFilter: 'blur(12px)'
}

// The stand-in for a code-mode preview that never got a chance to paint
// (PublicProjectViewer's CODE_PREVIEW_PAINT_TIMEOUT_MS). Deliberately NOT
// overlayCardStyle: that one is chrome floating on top of a live scene,
// rounded and glowing so it reads as UI reaching toward a visitor. This IS
// the picture, sitting among other cards that show real content — square
// corners, no shadow, no call to action, so it reads as quiet rather than
// broken or asking for a click.
export const quietPreviewFallbackStyle = {
    background: 'rgba(6, 9, 13, 0.6)',
    border: '1px solid rgba(255,255,255,0.08)',
    color: 'rgba(245, 247, 250, 0.7)',
    borderRadius: 0,
    padding: '1rem 1.1rem',
    maxWidth: '28rem',
    textAlign: 'center'
}
