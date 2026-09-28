import { useMemo } from 'react'
import MapSourceView from './MapSourceView.jsx'
import MapWarpedSurface from './MapWarpedSurface.jsx'
import { cornerPinTransform, cornersToPixels, isDegenerateQuad, maskToClipPath, surfaceFilter } from './cornerPin.js'
import { isWarpable } from './pointEditing.js'

// Every surface, pinned, at a given pixel size. The desk and the output route
// both render exactly this — the desk at whatever size its frame ended up,
// the output at the window's — which is why what you align is what projects:
// there is no second code path that could disagree about the geometry.
//
// Corners are normalised, so "the same mapping at a different size" is a
// multiply, not a re-solve.
//
// Two roads to the wall. A surface with no points is a div under a CSS
// matrix3d — the only road that carries a live web page. A surface with
// points is bent, and a matrix cannot bend, so it goes through a mesh on a
// canvas instead (MapWarpedSurface.jsx). With no points the two roads land
// on the same pixels.
export default function MapStage({
    mapping,
    spaceId = '',
    width,
    height,
    live = true,
    soloSurfaceId = null,
    network = null,
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
            const warped = Boolean(surface.points?.length) && isWarpable(surface.source?.kind)
            return { surface, hidden, transform, warped }
        })
    }, [mapping, width, height, soloSurfaceId])

    return (
        <div
            className={`map-stage ${className}`.trim()}
            style={{ width, height, background: mapping?.background || '#000000' }}
        >
            {surfaces.map(({ surface, hidden, transform, warped }) => {
                // A quad collapsed onto itself has no transform to give. The
                // surface is dropped for that frame rather than drawn wrong —
                // a corner dragged onto its neighbour must not take the whole
                // wall down with it.
                if (hidden || !transform) return null
                // The look is the same on both roads, and it is CSS on the
                // wrapper either way: opacity, the colour filter, the blend,
                // and the fade a cue asks for.
                const look = {
                    opacity: surface.opacity,
                    // The fade lives on the mapping, not on a timer in
                    // this component: the desk preview and the wall
                    // read the same number out of the same document,
                    // so one cue cannot fade at two speeds.
                    transitionDuration: `${mapping?.fade || 0}s`,
                    filter: surfaceFilter(surface),
                    mixBlendMode: surface.blend === 'add' ? 'plus-lighter' : surface.blend
                }
                if (warped) {
                    return (
                        <MapWarpedSurface
                            key={surface.id}
                            surface={surface}
                            width={width}
                            height={height}
                            spaceId={spaceId}
                            live={live}
                            network={network}
                            label={surface.name || surface.id}
                            style={look}
                        />
                    )
                }
                return (
                    <div
                        key={surface.id}
                        className="map-stage-surface"
                        data-surface-id={surface.id}
                        style={{
                            width: surface.resolution[0],
                            height: surface.resolution[1],
                            transform,
                            // Older documents may still carry a cut-out mask;
                            // it is honoured, never edited.
                            clipPath: maskToClipPath(surface.mask),
                            ...look
                        }}
                    >
                        <MapSourceView surface={surface} spaceId={spaceId} live={live} network={network} label={surface.name || surface.id} />
                    </div>
                )
            })}
        </div>
    )
}
