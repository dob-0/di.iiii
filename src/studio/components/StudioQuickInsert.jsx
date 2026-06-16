import { useEffect } from 'react'

const ENTITY_TYPES = [
    { key: 'box', label: '◻ Box' },
    { key: 'sphere', label: '○ Sphere' },
    { key: 'cone', label: '△ Cone' },
    { key: 'cylinder', label: '⬡ Cylinder' },
    { key: 'text', label: 'T Text' },
    { key: 'pointLight', label: '· Point Light' },
    { key: 'spotLight', label: '▽ Spot Light' },
    { key: 'directionalLight', label: '↘ Dir. Light' },
    { key: 'ambientLight', label: '☀ Ambient' },
]

export default function StudioQuickInsert({ position, onClose, onCreateEntity, onCreateFromAsset, assets = [] }) {
    useEffect(() => {
        const handler = (e) => { if (e.key === 'Escape') onClose() }
        window.addEventListener('keydown', handler)
        return () => window.removeEventListener('keydown', handler)
    }, [onClose])

    const vw = typeof window !== 'undefined' ? window.innerWidth : 1280
    const vh = typeof window !== 'undefined' ? window.innerHeight : 800
    const left = Math.min(position.x, vw - 300)
    const top = Math.min(position.y, vh - 320)

    const topAssets = assets.slice(0, 6)

    return (
        <div className="sqi-overlay" onClick={onClose}>
            <div className="sqi-popup" style={{ left, top }} onClick={(e) => e.stopPropagation()}>
                <div className="sqi-section-label">Add entity</div>
                <div className="sqi-grid">
                    {ENTITY_TYPES.map(({ key, label }) => (
                        <button
                            key={key}
                            className="sqi-btn"
                            onClick={() => { onCreateEntity(key); onClose() }}
                        >
                            {label}
                        </button>
                    ))}
                </div>

                {topAssets.length > 0 && (
                    <>
                        <div className="sqi-section-label sqi-section-label--gap">From space assets</div>
                        <div className="sqi-grid sqi-grid--assets">
                            {topAssets.map((asset) => {
                                const name = (asset.name || asset.url || '').split('/').pop()
                                return (
                                    <button
                                        key={asset.id || asset.url}
                                        className="sqi-btn sqi-btn--asset"
                                        title={name}
                                        onClick={() => {
                                            onCreateFromAsset?.(asset)
                                            onClose()
                                        }}
                                    >
                                        {name.slice(0, 12)}
                                    </button>
                                )
                            })}
                        </div>
                    </>
                )}
            </div>
        </div>
    )
}
