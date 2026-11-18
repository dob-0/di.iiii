import { lazy, Suspense, useMemo } from 'react'
import { ASPECT, layoutMap } from './monitorMapLayout.js'
import { Map2D, MapList } from './MonitorMap.jsx'

// The MIXED view of the Spaces world: the 3D room, the 2D map and the live
// people / spaces list on one screen. One world, one selection, one poll: the
// parent owns all three (it builds `world` from the 10 s poll and holds the
// selection), so a click in any pane lights the node in the other two and a
// change shows in all three at once. Wide screens: 3D large on the left, 2D on
// the top right, the list under it. Under 1100 px they stack: 3D, 2D, list.

const Map3D = lazy(() => import('./MonitorMap3D.jsx'))

export default function SpacesMixed({ world, selectedId, onPick, live = true, layoutOf = null }) {
    const layout = useMemo(() => (layoutOf ? layoutOf(world, ASPECT) : layoutMap(world, ASPECT)), [world, layoutOf])
    const nodes = world?.nodes || []
    return (
        <div className="spaces-mixed" data-spaces-mixed>
            <section className="spaces-mixed-pane is-3d" data-mixed-pane="3d" aria-label="3D room">
                <Suspense fallback={<div className="monitor-note">Loading the 3D room…</div>}>
                    <Map3D layout={layout} selectedId={selectedId} onPick={onPick} live={live} legend />
                </Suspense>
            </section>
            <section className="spaces-mixed-pane is-2d" data-mixed-pane="2d" aria-label="2D map">
                <Map2D layout={layout} selectedId={selectedId} onPick={onPick} live={live} legend />
            </section>
            <section className="spaces-mixed-pane is-list" data-mixed-pane="list" aria-label="People and spaces">
                <MapList nodes={nodes} selectedId={selectedId} onPick={onPick} />
            </section>
        </div>
    )
}
