import { useEffect } from 'react'
import { useRigLookEntities } from './useRigLook.js'

// THE SPACE VIEW FOLLOWS THE DESK'S LOOK (RIG_BUILD.md §15.6). /{space} — the room as it
// opens, the one the owner watches a show in — drew the document as saved while view A
// and the Studio already posed the lamps by the look the desk plays. This hands the room
// the same drawing: posed by the live look, faded between cues, the wash at the look's
// level, strobes as flashes. Lazy-loaded by PublicProjectViewer only when the room holds
// a rig, so a space with none pays nothing. Renders nothing itself; `null` = draw the
// document as it is.
export default function RoomLookFollower({ document, onEntities }) {
    const { entities } = useRigLookEntities(document)
    useEffect(() => {
        onEntities(entities === document?.entities ? null : entities)
    }, [entities, document, onEntities])
    useEffect(() => () => onEntities(null), [onEntities])
    return null
}
