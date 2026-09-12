import { useMemo } from 'react'
import { portalHref } from '../viewport/portalHref.js'

// A room is a canvas, and a canvas has no text in it.
//
// That was tolerable while the front page was an HTML page with the room drawn
// behind it. Now that `/` opens the room itself, everything that reads a page
// rather than looks at one — a search engine, a screen reader, a visitor whose
// WebGL failed — gets an empty document: the head still carries the title and
// the card, but the body is one empty div.
//
// This is that missing body. It is the SAME content the room already shows, in
// the form a reader needs: the room's name, its one line, and its doors as real
// anchors. Not a keyword block and never different from what is on screen — if
// a door is added in the editor it appears here, because both read one document.
//
// Visually hidden rather than `display: none`: hidden content is skipped by
// assistive tech and discounted by crawlers, whereas the clip-rect idiom keeps
// it in the accessibility tree and in the DOM. Anchors stay keyboard-reachable
// on focus, which is also the only way to leave this room without a mouse.
export default function RoomTextLayer({ title, spaceId, entities = [] }) {
    const doors = useMemo(() => (entities || [])
        .filter((entity) => entity?.type === 'portal')
        .map((entity) => {
            const reference = entity.components?.reference || {}
            return {
                id: entity.id,
                label: reference.label || entity.name || 'a room',
                href: portalHref(reference.spaceId || spaceId, reference.projectId)
            }
        })
        .filter((door) => door.href), [entities, spaceId])

    const lines = useMemo(() => (entities || [])
        .filter((entity) => entity?.type === 'text' && entity.components?.text?.value)
        .map((entity) => String(entity.components.text.value).split('\n').join(' '))
        .filter(Boolean), [entities])

    return (
        <div className="room-text-layer">
            <h1>{title}</h1>
            {lines.map((line, index) => <p key={`${line}-${index}`}>{line}</p>)}
            {doors.length ? (
                <nav aria-label="Doors in this room">
                    <ul>
                        {doors.map((door) => (
                            <li key={door.id}><a href={door.href}>{door.label}</a></li>
                        ))}
                    </ul>
                </nav>
            ) : null}
        </div>
    )
}
