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
