import './madeWithBadge.css'

// The public viewer and exhibitions are di.iiii's widest audience and
// previously offered no path from watching into making. One quiet affordance,
// shared by every public surface. variant: 'chrome' flows inside the
// live-scene header; 'floating' pins itself to the bottom-left corner.
//
// It is a way IN from somebody else's work, so it has nothing to offer on
// di.iiii's own front room: the badge's href is `/`, and `/` renders the `main`
// space, so inside `main` it is a link back to the room the visitor is already
// standing in. `spaceId` is passed rather than read from the router because
// this mounts inside surfaces that are rendered without one (the jam, embedded
// windows, and most of the component tests) — reading location here made the
// badge throw in all of them.
// Declared here rather than imported: this badge renders inside surfaces whose
// tests mock `projectsApi`, and reaching into that module for the id made the
// badge throw in every one of them. It is the space `/` renders — kept in step
// with `PREFERRED_SPACE_ID` in GridFloorBackground.jsx.
const PLATFORM_HOME_SPACE_ID = 'main'

export const isPlatformOwnSpace = (spaceId) => spaceId === PLATFORM_HOME_SPACE_ID

export default function MadeWithBadge({ variant = 'floating', spaceId = null }) {
    if (isPlatformOwnSpace(spaceId)) return null

    return (
        <a
            className={`made-with-di made-with-di--${variant}`}
            href="/"
            aria-label="Made with di.iiii — build your own space"
        >
            <span className="made-with-di-mark" aria-hidden="true">◈</span>
            <span className="made-with-di-text">Made with di.iiii</span>
            <span className="made-with-di-cta">— build yours</span>
        </a>
    )
}
