import { useMemo } from 'react'
import { TYPE_LIBRARY } from './types/index.js'
import { libraryWithShow } from './rental.js'
import { rigProgress } from './rigProgress.js'
import { RigSteps, usePointerLocked } from './RigSteps.jsx'

// The steps row in the room itself — /{space}, the space as it opens (RIG_BUILD.md §14).
// Owner, 2026-09-28: "also make buttons in space that we can easy move in the workflow".
// Loaded by PublicProjectViewer only when the room holds a rig (hasRig), so a space
// with none pays nothing for it. It reads the room's own document — the same one the
// room is drawn from — and asks the desk nothing.
export default function RoomRigSteps({ document, spaceId, projectId, projectLabel = null, isLocalInstall = false, underBar = false }) {
    const entities = document?.entities
    const progress = useMemo(() => (entities ? rigProgress({ entities, library: libraryWithShow(TYPE_LIBRARY, entities), projectId }) : null), [entities, projectId])
    const locked = usePointerLocked()
    return (
        <RigSteps
            spaceId={spaceId}
            projectId={projectId}
            projectLabel={projectLabel}
            here="room"
            progress={progress}
            isLocalInstall={isLocalInstall}
            hidden={locked}
            className={`rigsteps--under${underBar ? '' : ' rigsteps--top'}`}
        />
    )
}
