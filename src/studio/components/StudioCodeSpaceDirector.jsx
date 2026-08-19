import { Suspense, useMemo } from 'react'
import { appNavigate } from '../../utils/appNavigate.js'
import { getCodeSpace } from '../utils/codeSpaces.js'
import { WORK_DIRECTOR_SURFACES } from '../../works/routes.jsx'
import { buildStudioHubPath, buildStudioSpacesPath } from '../utils/studioRouting.js'
import '../styles/studio-hub.css'
import './studioCodeSpaceDirector.css'

// The authoring surface for a space whose scene is CODE.
//
// Studio's editor opens a project document. A code space has none — its scene is
// React, living in src/, and the thing that authors it is the piece's own
// timeline panel. So this page is Studio's chrome around that panel: you arrive
// from the Spaces list, you can see which space you are in, and you can get
// back, exactly as you can from the project editor.
//
// It mounts the SAME AlgoVrithmExperience the public route mounts. Not a copy of
// its wiring: the piece and the panel are one state tree (the playhead is ticked
// from inside the Canvas by RitualClockDriver, the edit list is the draft the
// Canvas renders from), so lifting the panel out on its own would mean rebuilding
// all of it and then keeping two versions honest. Two props do the whole job.
//
// LAZY, and it must stay lazy. The experience pulls three.js and warms ~190 MB of
// footage on mount. Studio's hub pays neither today and must not start. The
// registry keeps it lazy for the same reason, and is the only place a work's
// module is named — see src/works/works.js.

export default function StudioCodeSpaceDirector({ spaceId }) {
    const codeSpace = useMemo(() => getCodeSpace(spaceId), [spaceId])
    // Indexed, not called: react-hooks reads a component that arrives from a
    // function call as one created during render, and warns that its state
    // will reset. The map holds the lazy component itself.
    const Surface = WORK_DIRECTOR_SURFACES[spaceId] ?? null

    // A space id that is not a code space, or is one this build has no surface
    // for. Says which, and offers the way out — a blank page here would read as
    // a broken editor rather than a wrong address.
    if (!codeSpace || !Surface) {
        return (
            <div className="studio-shell-root scsd-root">
                <div className="scsd-head">
                    <p className="sh-space-context">Space: {spaceId}</p>
                    <h1 className="sh-title">No director here</h1>
                </div>
                <div className="scsd-empty">
                    <p>
                        {codeSpace
                            ? 'This space is code-backed, but this build has no authoring surface for it.'
                            : 'This space keeps its scenes as project documents. Open one from Projects.'}
                    </p>
                    <button className="sh-link" onClick={() => appNavigate(buildStudioHubPath(spaceId))}>
                        ← Projects
                    </button>
                </div>
            </div>
        )
    }

    return (
        <div className="studio-shell-root scsd-root">
            <header className="scsd-head">
                <div>
                    <p className="sh-space-context">Space: {codeSpace.label}</p>
                    <h1 className="sh-title">{codeSpace.directorLabel}</h1>
                </div>
                <nav className="scsd-links">
                    <button className="sh-link" onClick={() => appNavigate(buildStudioSpacesPath())}>← Spaces</button>
                    <span className="sh-sep">·</span>
                    <button className="sh-link" onClick={() => appNavigate(buildStudioHubPath(spaceId))}>Projects</button>
                    <span className="sh-sep">·</span>
                    {/* The bare piece, full screen and with no Studio around it.
                        Kept because judging timing means watching it at the size
                        and aspect an audience gets, and because XR entry from
                        under a header is meaningless. */}
                    <button className="sh-link" onClick={() => appNavigate(codeSpace.path)}>Open the piece</button>
                </nav>
            </header>

            {/* The positioning context the embedded root needs — see the
                `.is-embedded` rule in algoVrithm.css. Without a positioned host
                an `absolute` root escapes to the nearest one, which is the page. */}
            <div className="scsd-stage">
                <Suspense fallback={<div className="scsd-loading">Loading the piece…</div>}>
                    <Surface embedded director />
                </Suspense>
            </div>
        </div>
    )
}
