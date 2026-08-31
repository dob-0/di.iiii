import { useCallback, useEffect, useMemo, useState } from 'react'
import DirectorPanel from '../director/DirectorPanel.jsx'
import useEditHistory from '../director/useEditHistory.js'
import { PIECE_IDS, loadPiece } from '../director/pieces.js'
import { totalDurationSec } from '../../timeline/editList.js'
import { useSceneClock } from '../../timeline/clock.js'
import useSavedTiming from '../director/useSavedTiming.js'
import '../director/director.css'

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
    // Loaded, not imported. A descriptor reaches its piece's sequences and its
    // media bin, so importing one here would put an artwork in the bundle
    // every visitor downloads — which is exactly how 88 MB of reels ended up
    // in the main graph before the works registry existed.
    const requested = node?.values?.piece ?? PIECE_IDS[0] ?? null
    const [piece, setPiece] = useState(null)
    const [resolved, setResolved] = useState(false)

    useEffect(() => {
        let alive = true
        setResolved(false)
        loadPiece(requested)
            .then((loaded) => { if (alive) { setPiece(loaded); setResolved(true) } })
            .catch(() => { if (alive) { setPiece(null); setResolved(true) } })
        return () => { alive = false }
    }, [requested])

    // "Saved to this space" works for any piece that names a space to save
    // into. It used to be enabled only for algovrithm, because the hook had
    // that space id compiled in; the piece supplies it now, so a second piece
    // gets the same behaviour by declaring `savesToSpace` and nothing here
    // changes. A piece without one still edits, it just cannot persist.
    //
    // Called unconditionally, before any early return — a hook behind an `if`
    // changes hook order the moment the piece resolves.
    const savesTo = piece?.savesToSpace || null
    const timing = useSavedTiming({ spaceId: savesTo, baseline: piece?.baseline ?? EMPTY })

    if (!resolved || (savesTo && !timing.ready)) {
        return <div className="raw-director-window" aria-hidden="true" />
    }

    // No descriptor for this id — an unregistered piece, or a build that
    // carries no works at all (DI_PROFILE=local). Both are true statements
    // about this build rather than an error.
    if (!piece) {
        return (
            <div className="raw-director-window raw-director-window-empty">
                <p>
                    {requested
                        ? `No piece called “${requested}” in this build.`
                        : 'No piece is registered in this build.'}
                </p>
            </div>
        )
    }

    return (
        <DirectorPanelWindowEditor
            piece={piece}
            initialSequences={savesTo ? timing.sequences : piece.baseline}
            onSaveTiming={savesTo ? timing.save : null}
        />
    )
}

// Stable identity: a fresh [] each render would re-run the timing effect on
// every paint.
const EMPTY = []

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
    const clock = useSceneClock({ durationSec, loop: true })

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
