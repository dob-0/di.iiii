// One name per space — the rule the owner approved on 2026-09-14.
//
// A SPACE's own name is the one name anybody sees for that space in di.iiii's
// own furniture: the /spaces card, the list row, the map star, the heading, the
// breadcrumb, the tab. A PROJECT's name shows only inside that project.
//
// Measured on dev before this: six of thirteen cards printed the same words
// three times — the id in mono ("drum-rhythms"), the name ("Drum Rhythms") and
// a "Project: Drum Rhythms" line — and the ones that did not repeat themselves
// said something worse: WCC Exhibition, "Project: Main"; di.iiii, "Project:
// Everything made here". A visitor cannot tell a space from what it opens on,
// and should never have to — to them the space IS what it opens on.
//
// Pure on purpose, so the rule is tested on plain strings rather than inferred
// from a rendered grid.

// The words, not the spelling: "br_id_ge" and "br-id-ge", "Drum Rhythms" and
// "drum-rhythms" are one name to a reader. Letters and digits in any script
// (Armenian titles are real here), everything else dropped.
const nameKey = (value) => String(value ?? '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '')

export const sameName = (a, b) => {
    const left = nameKey(a)
    return left !== '' && left === nameKey(b)
}

// What a space is called: its label, or its id when it has none.
export const spaceName = (space) => (space?.label || '').trim() || space?.id || ''

// The published project's title, when — and only when — a card may say it.
//
// Never to a visitor: a card is the way INTO the space, not into the project,
// and a space that opens straight into one piece has nothing to add by naming
// the piece. To an account managing its spaces the line is still information
// (which of my projects is the door?), so it stays — but only where it says
// something the name does not. "Project: azd" under "azd" is not information.
export const doorTitleForCard = ({ space, projectTitle, isVisitor }) => {
    if (isVisitor || !space?.publishedProjectId) return null
    const title = (projectTitle || '').trim()
    // A title lookup that failed hands back the bare project id — an
    // identifier, not a name, so it is not worth a line either.
    if (!title || title === space.publishedProjectId) return null
    if (sameName(title, spaceName(space))) return null
    return title
}
