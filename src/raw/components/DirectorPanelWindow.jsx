import { useCallback, useMemo, useState } from 'react'
import DirectorPanel from '../director/DirectorPanel.jsx'
import useEditHistory from '../director/useEditHistory.js'
import { ALGOVRITHM_PIECE, PIECE_IDS, getPiece } from '../director/pieces.js'
import { totalDurationSec } from '../../algoVrithm/editList.js'
import { useRitualClock } from '../../algoVrithm/ritualClock.js'
import useSavedTiming from '../../algoVrithm/useSavedTiming.js'
import '../../algoVrithm/algoVrithm.css'

// The director, hosted in Raw (moved out of the piece 2026-08-05, made general
// 2026-08-05).
//
// The piece being edited is named by the node, resolved through pieces.js, and
// handed to the panel — a second, independent way to reach the same
// DirectorPanel Studio's code-space director page also mounts embedded. The
// panel imports no piece of its own — adding a second one is a descriptor
// plus its modules, and nothing here changes.
//
// The edit list is NOT kept in the node's values. Every row carries a
// `Component` function reference, which cannot survive the op-log's JSON
// round-trip — a row would come back as `{}` and the beat would vanish. So
// this window holds the draft in memory and writes it back the way it always
// did: "Save to source" patches the piece's own sequences file in place
// through the dev-server endpoint, which resolves the id against its own
// allow-list rather than trusting a path from here; off the dev server it
// falls through to "saved to this space" for algovrithm (useSavedTiming.js),
// so the same window works from di-studio.xyz. That file stays the source of
// truth either way.
//
// NOT YET WIRED: 3D placement. The gizmo, the orbit camera and the standpoint
// marker moved here with the rest of the editor (see ../director/), but they
// are R3F components and need the piece's Canvas mounted inside this window
// before they can attach to anything. Until then `onPlace` selects the row
// without moving the view, which is honest about doing half the job.
export default function DirectorPanelWindow({ node }) {
    const piece = useMemo(() => getPiece(node?.values?.piece), [node?.values?.piece])

    // useSavedTiming only knows about algovrithm (ALGO_VRITHM_SPACE_ID) — the
    // "saved to this space" fallback is not generalized to other pieces yet.
    // Only enabled for the piece it actually covers, so a future second piece
    // silently gets its own raw baseline instead of algovrithm's timing.
    const isAlgovrithm = piece.id === ALGOVRITHM_PIECE.id
    const timing = useSavedTiming({ enabled: isAlgovrithm })
    if (isAlgovrithm && !timing.ready) {
        return <div className="raw-director-window" aria-hidden="true" />
    }

    return (
        <DirectorPanelWindowEditor
            piece={piece}
            initialSequences={isAlgovrithm ? timing.sequences : piece.baseline}
            onSaveTiming={isAlgovrithm ? timing.save : null}
        />
    )
}

function DirectorPanelWindowEditor({ piece, initialSequences, onSaveTiming }) {
    // Keyed on the piece by the caller remounting this component (see `key`
    // would be needed if DirectorPanelWindow itself didn't already gate on
    // `piece.id` above) so switching to another one starts a fresh undo stack
    // rather than offering to undo one piece's edit into another's draft.
    //
    // Resolved BEFORE this mounts, same reasoning as AlgoVrithmExperience.jsx:
    // useEditHistory's initial value is a useState initializer, read once —
    // mounting it before the space's saved timing arrives would start every
    // session from the raw file and silently drop whatever was last saved to
    // this space.
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
                editing <strong>{piece.label}</strong>
                {PIECE_IDS.length === 1 ? ' · the only piece registered so far' : null}
                {' · '}placement handles need the piece canvas and are not wired yet
            </div>
            <DirectorPanel
                piece={piece}
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
