import { useCallback, useMemo, useState } from 'react'
import DirectorPanel from '../algovrithm-director/DirectorPanel.jsx'
import useEditHistory from '../algovrithm-director/useEditHistory.js'
import { totalDurationSec } from '../../algoVrithm/editList.js'
import { useRitualClock } from '../../algoVrithm/ritualClock.js'
import useSavedTiming from '../../algoVrithm/useSavedTiming.js'
import '../../algoVrithm/algoVrithm.css'

// The algovrithm director, hosted in Raw (moved here 2026-08-05).
//
// The piece itself no longer carries an editor: /algovrithm/scene is the work
// as an audience gets it, full screen and in VR or AR, with nothing to
// operate. Retiming happens here instead — a second, independent way to reach
// the same DirectorPanel Studio's code-space director page also mounts.
//
// The edit list is NOT kept in the node's values. Every row carries a
// `Component` function reference, which cannot survive the op-log's JSON
// round-trip — a row would come back as `{}` and the beat would vanish. So
// this window holds the draft in memory and writes it back the way it always
// did: "Save to source" patches src/algoVrithm/sequences/index.js in place
// through the dev-server endpoint; off the dev server it falls through to
// "saved to this space" (useSavedTiming.js), so the same window works from
// di-studio.xyz. Starting the draft from the space's OWN saved timing rather
// than the raw file is what makes that fallback safe — starting from the file
// would silently discard a timing overlay nobody in this window can see. The
// node records which piece is being edited, nothing more.
//
// NOT YET WIRED: 3D placement. The gizmo, the orbit camera and the standpoint
// marker moved here with the rest of the editor (see ../algovrithm-director/),
// but they are R3F components and need the piece's Canvas mounted inside this
// window before they can attach to anything. Until then `onPlace` selects the
// row without moving the view, which is honest about doing half the job.
export default function DirectorPanelWindow({ node }) {
    // Resolved BEFORE the editor mounts, same reasoning as
    // AlgoVrithmExperience.jsx: useEditHistory's initial value is a useState
    // initializer, read once — mounting it before the space's saved timing
    // arrives would start every session from the raw file and silently drop
    // whatever was last saved to this space.
    const timing = useSavedTiming()
    if (!timing.ready) {
        return <div className="raw-director-window" aria-hidden="true" />
    }
    return <DirectorPanelWindowEditor node={node} initialSequences={timing.sequences} onSaveTiming={timing.save} />
}

function DirectorPanelWindowEditor({ node, initialSequences, onSaveTiming }) {
    const history = useEditHistory(initialSequences, { enabled: true })
    const editList = history.present
    const durationSec = useMemo(() => totalDurationSec(editList), [editList])
    const clock = useRitualClock({ durationSec, loop: true })

    const [selectedId, setSelectedId] = useState(null)
    const placeTarget = useCallback(
        (name) => setSelectedId((previous) => (previous === name ? null : name)),
        []
    )

    return (
        <div className="raw-director-window">
            <div className="raw-director-note">
                editing <strong>{node?.values?.piece || 'algovrithm'}</strong> ·
                {' '}source of truth is <code>src/algoVrithm/sequences/index.js</code> ·
                {' '}placement handles need the piece canvas and are not wired yet
            </div>
            <DirectorPanel
                sequences={editList}
                onChange={history.set}
                clock={clock}
                selectedId={selectedId}
                onSelect={setSelectedId}
                onPlace={placeTarget}
                onSaveTiming={onSaveTiming}
            />
        </div>
    )
}
