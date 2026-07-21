import { useEffect } from 'react'
import { LIGHTS, PRIMITIVES } from '../utils/entityPalette.js'

// Double-click popup: the fast subset of the Create window. Same palette, same
// create pipeline (onCreateFromAsset adopts space assets / converts PDFs), plus
// a jump to the full Create window for Drive/Commons.
export default function StudioQuickInsert({ position, worldPos = null, onClose, onCreateEntity, onCreateFromAsset, assets = [], onOpenCreate, palette = null, moreLabel = 'More — imports, Drive, Commons ▸' }) {
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
        <div className="sqi-overlay" onClick={onClose} onKeyDown={(e) => e.key === 'Escape' && onClose()} role="button" tabIndex={0} aria-label="Close quick insert">
            <div className="sqi-popup" style={{ left, top }} onClick={(e) => e.stopPropagation()} role="none">
                <div className="sqi-section-label">Add entity</div>
                <div className="sqi-grid">
                    {(palette || [...PRIMITIVES, ...LIGHTS]).map(({ key, label, icon }) => (
                        <button
                            key={key}
                            className="sqi-btn"
                            onClick={() => { onCreateEntity(key, null, worldPos); onClose() }}
                        >
                            {icon} {label}
                        </button>
                    ))}
                </div>

                {topAssets.length > 0 && (
                    <>
                        <div className="sqi-section-label sqi-section-label--gap">From your files</div>
                        <div className="sqi-grid sqi-grid--assets">
                            {topAssets.map((asset) => {
                                const name = (asset.name || asset.url || '').split('/').pop()
                                return (
                                    <button
                                        key={asset.id || asset.url}
                                        className="sqi-btn sqi-btn--asset"
                                        title={name}
                                        onClick={() => {
                                            onCreateFromAsset?.(asset, worldPos)
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

                {onOpenCreate && (
                    <button
                        className="sqi-btn sqi-btn--more"
                        onClick={() => { onOpenCreate(); onClose() }}
                    >
                        {moreLabel}
                    </button>
                )}
            </div>
        </div>
    )
}
