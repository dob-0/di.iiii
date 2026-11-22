import { useEffect, useMemo, useRef, useSyncExternalStore } from 'react'
import MapSourceView from './MapSourceView.jsx'
import MapCrossfade from './MapCrossfade.jsx'
import MapMeshLayer, { MESH_KINDS, RackContext } from './MapMeshLayer.jsx'
import { cornerPinTransform, cornersToPixels, isDegenerateQuad, maskToClipPath } from './cornerPin.js'
import { isScreenKind, rectsToClipPath, screenInput, sharesWallLayer, visualKey } from './wallScreens.js'
import { colourTransfer, isWarpActive, softEdgeMask } from './sliceGeometry.js'
import { createMediaRack, rackKeyFor } from './mediaRack.js'
import { getMeshRenderer } from './meshRenderer.js'

// Every surface, pinned, at a given pixel size. The desk and the output route
// both render exactly this — the desk at whatever size its frame ended up,
// the output at the window's — which is why what you align is what projects:
// there is no second code path that could disagree about the geometry.
//
// Corners are normalised, so "the same mapping at a different size" is a
// multiply, not a re-solve.
//
// SCREENS (src/map/wallScreens.js). A surface whose source is `wall` shows its
// piece of whatever `mapping.playing` names, drawn at the OUTPUT's resolution
// so a visual made for a 3200x1440 wall lands pixel for pixel.
//
// HOW A SCREEN IS DRAWN (2026-10-25). Everything a page can read as pixels —
// a video, an image, a camera, a test card, a colour, and an uploaded HTML
// visual through the frame relay — is held ONCE in the stage's media rack
// (mediaRack.js) and drawn on every screen through a mesh by the page's one
// WebGL renderer (MapMeshLayer.jsx, meshRenderer.js), bent or not. So moving
// a warp point only ever changes geometry: nothing is swapped, restarted or
// faded, and every screen of one visual is on the same frame. A web link or a
// project — pixels nobody may read — stays an iframe under a CSS corner-pin,
// and unwarped screens of it share one copy, clipped to their rectangles.
//
// SLICE SETTINGS (the mapping window, MapAdvancedOutput.jsx): flip, colour
// (brightness, contrast, red, green, blue as one SVG filter), key, black
// background and soft edge apply to every surface.

const CSS_FILTER_PARTS = ({ saturation = 1, hue = 0 }) => [
    saturation !== 1 ? `saturate(${saturation})` : '',
    hue !== 0 ? `hue-rotate(${hue}deg)` : ''
]

// The CSS filter for a slice. Brightness and contrast go through the SVG
// colour filter when one is needed (so they are not applied twice), and as
// plain CSS filters otherwise.
const sliceFilter = (surface, filterId) => {
    const transfer = colourTransfer(surface)
    const parts = transfer
        ? [`url(#${filterId})`, ...CSS_FILTER_PARTS(surface)]
        : [
            surface.brightness !== undefined && surface.brightness !== 1 ? `brightness(${surface.brightness})` : '',
            surface.contrast !== undefined && surface.contrast !== 1 ? `contrast(${surface.contrast})` : '',
            ...CSS_FILTER_PARTS(surface)
        ]
    // A key is a luma key: its brightness says how much of what is under it
    // shows. Grey, multiplied over everything beneath, is exactly that.
    if (surface.isKey) parts.push('grayscale(1)')
    const joined = parts.filter(Boolean).join(' ')
    return joined || 'none'
}

const flipTransform = (flip) => {
    if (flip === 'h') return 'scale(-1, 1)'
    if (flip === 'v') return 'scale(1, -1)'
    if (flip === 'hv') return 'scale(-1, -1)'
    return null
}

const maskStyle = (softEdge) => {
    const mask = softEdgeMask(softEdge)
    if (!mask) return {}
    return { maskImage: mask, WebkitMaskImage: mask, maskComposite: 'intersect', WebkitMaskComposite: 'source-in' }
}

const filterIdFor = (surfaceId) => `map-colour-${String(surfaceId).replace(/[^a-zA-Z0-9_-]/g, '')}`

export default function MapStage({
    mapping,
    spaceId = '',
    width,
    height,
    live = true,
    soloSurfaceId = null,
    network = null,
    assets = null,
    projectId = null,
    className = ''
}) {
    const wallWidth = Math.max(1, Math.round(mapping?.output?.width || 1920))
    const wallHeight = Math.max(1, Math.round(mapping?.output?.height || 1080))
    const visuals = mapping?.visuals
    const visualById = useMemo(() => new Map((visuals || []).map((visual) => [visual.id, visual])), [visuals])
    const playing = visualById.get(mapping?.playing) || null

    // The stage's one copy of every source its screens draw.
    const rack = useMemo(() => createMediaRack({ onDispose: (key) => getMeshRenderer()?.forget(key) }), [])
    useEffect(() => () => rack.destroy(), [rack])
    useSyncExternalStore(rack.subscribeStatus, rack.statusVersion, () => 0)
    const rackRef = useRef(null)
    useEffect(() => { rack.setContainer(rackRef.current) }, [rack])
    useEffect(() => { rack.setScale(width / wallWidth) }, [rack, width, wallWidth])

    // Can the mesh draw this source at this size? A page whose relay gave up
    // (no canvas, an old server) cannot, and goes back to an iframe.
    const meshable = (source, frame) => Boolean(source) && (
        (MESH_KINDS.has(source.kind) && (source.kind === 'colour' || source.kind === 'camera' || source.kind === 'test' || Boolean(source.ref)))
        || (source.kind === 'html' && Boolean(source.ref) && rack.status(rackKeyFor(source, frame)) !== 'none')
    )

    const surfaces = useMemo(() => {
        if (!(width > 0) || !(height > 0)) return []
        return (mapping?.surfaces || []).map((surface) => {
            const hidden = !surface.enabled || (soloSurfaceId && surface.id !== soloSurfaceId)
            const corners = cornersToPixels(surface.corners, width, height)
            const degenerate = isDegenerateQuad(corners)
            const warped = isWarpActive(surface.warp)
            if (!isScreenKind(surface.source?.kind)) {
                const transform = degenerate ? null : cornerPinTransform(surface.resolution[0], surface.resolution[1], corners)
                return { surface, hidden, transform, corners, warped, screen: null }
            }
            const input = screenInput(surface)
            const boxWidth = Math.max(1, Math.round(input[2] * wallWidth))
            const boxHeight = Math.max(1, Math.round(input[3] * wallHeight))
            const transform = degenerate ? null : cornerPinTransform(boxWidth, boxHeight, corners)
            const shared = !warped && sharesWallLayer(surface, input)
            return { surface, hidden, transform, corners, warped, screen: { input, boxWidth, boxHeight, shared } }
        })
    }, [mapping, width, height, soloSurfaceId, wallWidth, wallHeight])

    const wallFrame = { width: wallWidth, height: wallHeight }
    const wallMeshed = meshable(playing?.source, wallFrame)

    // The shared iframe layer, for a wall visual the mesh cannot draw: every
    // visible unwarped wall screen, one copy, painted where the first of them
    // sits in the list.
    const shared = useMemo(() => {
        if (wallMeshed) return null
        const members = surfaces.filter((entry) => entry.screen?.shared && !entry.hidden && entry.transform)
        if (!members.length) return null
        return {
            firstId: members[0].surface.id,
            clipPath: rectsToClipPath(members.map((entry) => entry.screen.input), wallWidth, wallHeight),
            transform: cornerPinTransform(wallWidth, wallHeight, [[0, 0], [width, 0], [width, height], [0, height]])
        }
    }, [surfaces, wallWidth, wallHeight, width, height, wallMeshed])

    const colourFilters = useMemo(() => surfaces
        .filter((entry) => !entry.hidden)
        .map((entry) => ({ id: filterIdFor(entry.surface.id), transfer: colourTransfer(entry.surface) }))
        .filter((entry) => entry.transfer), [surfaces])

    const fade = mapping?.fade || 0
    const wallItem = playing ? { key: visualKey(playing, 'wall'), visual: playing } : null
    const sourceProps = { spaceId, live, network, assets, projectId }

    // The wall picture at full output size, placed so the screen's input
    // rectangle (and its rotation) fills a box of boxWidth x boxHeight.
    function renderWallPicture(item, onReady, screen, rotation = 0) {
        const cx = (screen.input[0] + (screen.input[2] / 2)) * wallWidth
        const cy = (screen.input[1] + (screen.input[3] / 2)) * wallHeight
        const transform = `translate(${screen.boxWidth / 2}px, ${screen.boxHeight / 2}px) rotate(${-rotation}deg) translate(${-cx}px, ${-cy}px)`
        return (
            <div className="map-wall-picture" style={{ width: wallWidth, height: wallHeight, transform }}>
                <MapSourceView
                    surface={{ resolution: [wallWidth, wallHeight], source: item.visual.source, name: item.visual.name, effect: null }}
                    {...sourceProps}
                    label={item.visual.name}
                    onReady={onReady}
                />
            </div>
        )
    }

    return (
        <RackContext.Provider value={rack}>
            <div
                className={`map-stage ${className}`.trim()}
                style={{ width, height, background: mapping?.background || '#000000' }}
            >
                {/* The rack's hidden relay pages live here: inside the stage,
                    scaled to it, so the browser keeps animating them. */}
                <div className="map-relay-rack" ref={rackRef} aria-hidden="true" />
                {colourFilters.length ? (
                    <svg className="map-colour-defs" width="0" height="0" aria-hidden="true" focusable="false">
                        <defs>
                            {colourFilters.map(({ id, transfer }) => (
                                <filter key={id} id={id} colorInterpolationFilters="sRGB">
                                    <feComponentTransfer>
                                        <feFuncR type="linear" slope={transfer.r.slope} intercept={transfer.r.intercept} />
                                        <feFuncG type="linear" slope={transfer.g.slope} intercept={transfer.g.intercept} />
                                        <feFuncB type="linear" slope={transfer.b.slope} intercept={transfer.b.intercept} />
                                    </feComponentTransfer>
                                </filter>
                            ))}
                        </defs>
                    </svg>
                ) : null}
                {surfaces.map(({ surface, hidden, transform, corners, warped, screen }) => {
                    // A quad collapsed onto itself has no transform to give. The
                    // surface is dropped for that frame rather than drawn wrong —
                    // a corner dragged onto its neighbour must not take the whole
                    // wall down with it.
                    if (hidden || !transform) return null

                    const kind = surface.source.kind
                    const own = kind === 'visual' ? (visualById.get(surface.source.ref) || null) : null
                    const item = kind === 'wall' ? wallItem : (own ? { key: visualKey(own, 'screen'), visual: own } : null)
                    const frame = kind === 'wall'
                        ? wallFrame
                        : { width: screen ? screen.boxWidth : surface.resolution[0], height: screen ? screen.boxHeight : surface.resolution[1] }
                    const showing = screen ? item?.visual?.source : surface.source
                    // Screens always go through the mesh when they can — bent or
                    // not — so a point edit never swaps the drawing. An old-style
                    // surface keeps its corner-pin until it is actually bent.
                    const meshed = screen ? meshable(showing, frame) : (warped && meshable(showing, frame))

                    if (screen?.shared && !meshed) {
                        if (surface.id !== shared?.firstId) return null
                        return (
                            <div
                                key="wall-shared"
                                className="map-stage-surface map-stage-wall"
                                data-surface-id="wall"
                                style={{ width: wallWidth, height: wallHeight, transform: shared.transform, clipPath: shared.clipPath }}
                            >
                                <MapCrossfade item={wallItem} fade={fade} renderItem={(entry, onReady) => renderWallPicture(entry, onReady, { input: [0, 0, 1, 1], boxWidth: wallWidth, boxHeight: wallHeight })} />
                            </div>
                        )
                    }

                    const look = {
                        opacity: surface.opacity,
                        // The fade lives on the mapping, not on a timer in
                        // this component: the desk preview and the wall
                        // read the same number out of the same document,
                        // so one cue cannot fade at two speeds.
                        transitionDuration: `${fade}s`,
                        filter: sliceFilter(surface, filterIdFor(surface.id)),
                        mixBlendMode: surface.isKey ? 'multiply' : (surface.blend === 'add' ? 'plus-lighter' : surface.blend)
                    }

                    if (meshed) {
                        const input = kind === 'wall' ? screen.input : [0, 0, 1, 1]
                        const rotation = kind === 'wall' ? (surface.inputRotation || 0) : 0
                        const renderMesh = (source, onReady) => (
                            <MapMeshLayer
                                corners={corners}
                                warp={surface.warp}
                                source={source}
                                frame={frame}
                                input={input}
                                rotation={rotation}
                                flip={surface.flip}
                                blackBg={surface.blackBg !== false}
                                softEdge={surface.softEdge}
                                stageWidth={width}
                                stageHeight={height}
                                onReady={onReady}
                            />
                        )
                        return (
                            <div key={surface.id} className="map-stage-mesh" data-surface-id={surface.id} style={{ ...look, width, height }}>
                                {screen
                                    ? <MapCrossfade item={item} fade={fade} renderItem={(entry, onReady) => renderMesh(entry.visual.source, onReady)} />
                                    : renderMesh(surface.source, null)}
                            </div>
                        )
                    }

                    const style = {
                        ...look,
                        width: screen ? screen.boxWidth : surface.resolution[0],
                        height: screen ? screen.boxHeight : surface.resolution[1],
                        transform,
                        clipPath: maskToClipPath(surface.mask),
                        background: surface.blackBg === false ? 'transparent' : undefined,
                        ...maskStyle(surface.softEdge)
                    }

                    let content
                    if (screen && kind === 'wall') {
                        content = <MapCrossfade item={wallItem} fade={fade} renderItem={(entry, onReady) => renderWallPicture(entry, onReady, screen, surface.inputRotation || 0)} />
                    } else if (screen) {
                        // One visual on this screen alone, fitted to it.
                        content = (
                            <MapCrossfade
                                item={item}
                                fade={fade}
                                renderItem={(entry, onReady) => (
                                    <MapSourceView
                                        surface={{ resolution: [screen.boxWidth, screen.boxHeight], source: entry.visual.source, name: entry.visual.name, effect: null }}
                                        {...sourceProps}
                                        label={entry.visual.name}
                                        onReady={onReady}
                                    />
                                )}
                            />
                        )
                    } else {
                        content = <MapSourceView surface={surface} {...sourceProps} label={surface.name || surface.id} />
                    }

                    const flip = flipTransform(surface.flip)
                    return (
                        <div key={surface.id} className="map-stage-surface" data-surface-id={surface.id} style={style}>
                            {flip ? <div className="map-stage-flip" style={{ transform: flip }}>{content}</div> : content}
                        </div>
                    )
                })}
            </div>
        </RackContext.Provider>
    )
}
