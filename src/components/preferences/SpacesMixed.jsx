import { lazy, Suspense, useMemo } from 'react'
import { layoutSpacesWorld } from './spacesWorld.js'
import { Map2D, MapList, useNarrow } from './MonitorMap.jsx'

// The MIXED view of the Spaces world: the 3D room, the 2D map and the live
// people / spaces list on one screen. One world, one selection, one poll: the
// parent owns all three (it builds `world` from the 10 s poll and holds the
// selection), so a click in any pane lights the node in the other two and a
// change shows in all three at once. Wide screens: 3D large on the left, 2D on
// the top right (3D and 2D are pointer-only: the list is the keyboard and screen-reader path), the list under it. Under 1100 px they stack: 3D, 2D, list.

const MIXED_ASPECT = 1.9 // the panes are wider than tall
const PHONE_ASPECT = 1 // round on a phone, where each pane is nearly square
const Map3D = lazy(() => import('./MonitorMap3D.jsx'))

export default function SpacesMixed({ world, selectedId, onPick, live = true }) {
    const narrow = useNarrow()
    const layout = useMemo(() => layoutSpacesWorld(world, narrow ? PHONE_ASPECT : MIXED_ASPECT), [world, narrow])
    const nodes = world?.nodes || []
    return (
        <div className="spaces-mixed" data-spaces-mixed>
            <section className="spaces-mixed-pane is-3d" data-mixed-pane="3d" aria-label="3D room" aria-hidden="true">
                <Suspense fallback={<div className="monitor-note">Loading the 3D room…</div>}>
                    <Map3D layout={layout} selectedId={selectedId} onPick={onPick} live={live} world pointerOnly />
                </Suspense>
                <p className="spaces-mixed-hint" data-mixed-hint>Drag to turn · right-drag to move · scroll to zoom</p>
            </section>
            <section className="spaces-mixed-pane is-2d" data-mixed-pane="2d" aria-label="2D map" aria-hidden="true">
                <Map2D layout={layout} selectedId={selectedId} onPick={onPick} live={live} world pointerOnly />
            </section>
            <section className="spaces-mixed-pane is-list" data-mixed-pane="list" aria-label="People and spaces">
                <MapList nodes={nodes} selectedId={selectedId} onPick={onPick} />
            </section>
        </div>
    )
}
