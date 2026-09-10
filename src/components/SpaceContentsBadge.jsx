import { buildSpaceContentsPath } from '../utils/spaceRouting.js'
import './madeWithBadge.css'

/**
 * The way from a room to the rest of the space it is in.
 *
 * A published room is the whole of what a visitor could reach: a space has one
 * door (`spaces.publishedProjectId`), the door opens onto one project, and
 * everything else in that space had no address anybody would ever click.
 * Measured on the owner's own copy, 2026-09-10: 114 projects reachable by no
 * click from anywhere, including a 116-object hub with 63 doors in it that
 * nothing linked TO.
 *
 * Deliberately built as the twin of MadeWithBadge next to it, in the same
 * corner, out of the same stylesheet: a mark at rest, the sentence on hover or
 * keyboard focus. The owner's 2026-08-23 call about that badge — a published
 * page is somebody's work and the way out must not land on top of it — applies
 * to this one exactly as much, and a second corner affordance with a different
 * shape would read as chrome belonging to the work.
 *
 * It renders nothing at all when there is nothing to go to: `count` of 0 or 1
 * means this room IS the space, and a link to a list holding only the room you
 * are standing in is worse than no link.
 */
export default function SpaceContentsBadge({ spaceId = null, count = 0 }) {
    if (!spaceId || count < 2) return null

    return (
        <a
            className="made-with-di made-with-di--floating made-with-di--contents"
            href={buildSpaceContentsPath(spaceId)}
            aria-label={`Everything in this space — ${count} things`}
        >
            <span className="made-with-di-mark" aria-hidden="true">▤</span>
            <span className="made-with-di-text">Everything in this space</span>
            <span className="made-with-di-cta">— {count}</span>
        </a>
    )
}
