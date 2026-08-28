import { useMemo } from 'react'
import MapSourceView from './MapSourceView.jsx'
import { cornerPinTransform, cornersToPixels, isDegenerateQuad, maskToClipPath, surfaceFilter } from './cornerPin.js'

// Every surface, pinned, at a given pixel size. The desk and the output route
// both render exactly this — the desk at whatever size its frame ended up,
// the output at the window's — which is why what you align is what projects:
// there is no second code path that could disagree about the geometry.
//
// Corners are normalised, so "the same mapping at a different size" is a
// multiply, not a re-solve.
export default function MapStage({
    mapping,
    spaceId = '',
    width,
    height,
    live = true,
    soloSurfaceId = null,
    className = ''
}) {
    const surfaces = useMemo(() => {
        if (!(width > 0) || !(height > 0)) return []
        return (mapping?.surfaces || []).map((surface) => {
            const hidden = !surface.enabled || (soloSurfaceId && surface.id !== soloSurfaceId)
            const corners = cornersToPixels(surface.corners, width, height)
            const transform = isDegenerateQuad(corners)
                ? null
                : cornerPinTransform(surface.resolution[0], surface.resolution[1], corners)
            return { surface, hidden, transform }
        })
    }, [mapping, width, height, soloSurfaceId])

    return (
        <div
            className={`map-stage ${className}`.trim()}
            style={{ width, height, background: mapping?.background || '#000000' }}
        >
            {surfaces.map(({ surface, hidden, transform }) => {
                // A quad collapsed onto itself has no transform to give. The
                // surface is dropped for that frame rather than drawn wrong —
                // a corner dragged onto its neighbour must not take the whole
                // wall down with it.
                if (hidden || !transform) return null
                return (
                    <div
                        key={surface.id}
                        className="map-stage-surface"
                        data-surface-id={surface.id}
                        style={{
                            width: surface.resolution[0],
                            height: surface.resolution[1],
                            transform,
                            clipPath: maskToClipPath(surface.mask),
                            opacity: surface.opacity,
                            // The fade lives on the mapping, not on a timer in
                            // this component: the desk preview and the wall
                            // read the same number out of the same document,
                            // so one cue cannot fade at two speeds.
                            transitionDuration: `${mapping?.fade || 0}s`,
                            filter: surfaceFilter(surface),
                            mixBlendMode: surface.blend === 'add' ? 'plus-lighter' : surface.blend
                        }}
                    >
                        <MapSourceView surface={surface} spaceId={spaceId} live={live} label={surface.name || surface.id} />
                    </div>
                )
            })}
        </div>
    )
}
