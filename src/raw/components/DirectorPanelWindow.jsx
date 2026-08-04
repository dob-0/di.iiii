import { useCallback, useMemo, useState } from 'react'
import DirectorPanel from '../algovrithm-director/DirectorPanel.jsx'
import useEditHistory from '../algovrithm-director/useEditHistory.js'
import { totalDurationSec } from '../../algoVrithm/editList.js'
import { useRitualClock } from '../../algoVrithm/ritualClock.js'
import { SEQUENCES } from '../../algoVrithm/sequences/index.js'
import '../../algoVrithm/algoVrithm.css'

// The algovrithm director, hosted in Raw (moved here 2026-08-05).
//
// The piece itself no longer carries an editor: /algovrithm/scene is the work
// as an audience gets it, full screen and in VR or AR, with nothing to
// operate. Retiming happens here instead.
//
// The edit list is NOT kept in the node's values. Every row carries a
// `Component` function reference, which cannot survive the op-log's JSON
// round-trip — a row would come back as `{}` and the beat would vanish. So
// this window holds the draft in memory and writes it back the way it always
// did: "Save to source" patches src/algoVrithm/sequences/index.js in place
// through the dev-server endpoint, and that file stays the source of truth.
// The node records which piece is being edited, nothing more.
//
// NOT YET WIRED: 3D placement. The gizmo, the orbit camera and the standpoint
// marker moved here with the rest of the editor (see ../algovrithm-director/),
// but they are R3F components and need the piece's Canvas mounted inside this
// window before they can attach to anything. Until then `onPlace` selects the
// row without moving the view, which is honest about doing half the job.
export default function DirectorPanelWindow({ node }) {
    const history = useEditHistory(SEQUENCES, { enabled: true })
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
            />
        </div>
    )
}
