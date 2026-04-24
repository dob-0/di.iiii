const shellStyle = {
    minHeight: '100vh',
    display: 'grid',
    placeItems: 'center',
    padding: '2rem',
    background: 'radial-gradient(circle at top, rgba(33, 64, 105, 0.45), rgba(5, 10, 18, 0.96))',
    color: '#f3f7ff'
}

const panelStyle = {
    width: 'min(28rem, 100%)',
    padding: '1rem 1.25rem',
    borderRadius: '1rem',
    border: '1px solid rgba(255, 255, 255, 0.14)',
    background: 'rgba(10, 16, 28, 0.72)',
    boxShadow: '0 24px 60px rgba(0, 0, 0, 0.28)'
}

const labelStyle = {
    fontSize: '0.82rem',
    letterSpacing: '0.14em',
    textTransform: 'uppercase',
    opacity: 0.72
}

const titleStyle = {
    margin: '0.45rem 0 0',
    fontSize: '1.05rem',
    fontWeight: 600
}

export default function RouteSurfaceFallback({
    label = 'Loading surface',
    detail = 'Preparing the requested workspace...'
}) {
    return (
        <div style={shellStyle} role="status" aria-live="polite">
            <div style={panelStyle}>
                <div style={labelStyle}>{label}</div>
                <p style={titleStyle}>{detail}</p>
            </div>
        </div>
    )
}
