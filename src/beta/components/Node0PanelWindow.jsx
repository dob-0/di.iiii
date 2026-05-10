export default function Node0PanelWindow({ node }) {
    const title = node.values?.title || 'Node 0'
    const description = node.values?.description || ''

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '28px 28px 24px', boxSizing: 'border-box' }}>
            <div style={{ display: 'flex', gap: 5, marginBottom: 4 }} aria-hidden="true">
                {[0, 1, 2].map((i) => (
                    <span
                        key={i}
                        style={{ display: 'block', width: 10, height: 10, border: '2px solid #4df9ff', background: 'transparent' }}
                    />
                ))}
            </div>
            <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700, color: '#f4f7fb', letterSpacing: '-0.02em', lineHeight: 1.2, fontFamily: 'Inter, Segoe UI, sans-serif' }}>
                {title}
            </h1>
            {description ? (
                <p style={{ margin: 0, fontSize: 13, color: 'rgba(244,247,251,0.55)', lineHeight: 1.6, fontFamily: 'Inter, Segoe UI, sans-serif' }}>
                    {description}
                </p>
            ) : null}
            <span style={{ marginTop: 16, fontSize: 10, fontFamily: 'JetBrains Mono, monospace', color: 'rgba(77,249,255,0.45)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                node 0
            </span>
        </div>
    )
}
