// How the Spaces page lays its cards out: what is shown, and in what order.
//
// Kept out of SpaceHub so the ordering can be tested on plain objects, and so a
// second surface (the list view) arranges identically to the grid.

// What a space is, from a visitor's side of the door.
//   open    — public, and something is published in it
//   nodoor  — public, but nothing published: a visitor walks into an empty room
//   private — a visitor meets a login wall
export const spaceState = (space) =>
    space.isPublic ? (space.publishedProjectId ? 'open' : 'nodoor') : 'private'

export const ARRANGE_MODES = [
    { key: 'recent', label: 'Recent' },
    { key: 'name', label: 'Name' },
    { key: 'state', label: 'State' },
]

export const FILTER_MODES = [
    { key: 'all', label: 'All' },
    { key: 'open', label: 'Open to anyone' },
    { key: 'private', label: 'Only you' },
    { key: 'nodoor', label: 'Needs a door' },
]

const isArrange = (key) => ARRANGE_MODES.some(m => m.key === key)
const isFilter = (key) => FILTER_MODES.some(m => m.key === key)
export const normalizeArrange = (key) => (isArrange(key) ? key : 'recent')
export const normalizeFilter = (key) => (isFilter(key) ? key : 'all')

const touchedAt = (space) => space.lastTouchedAt || space.updatedAt || space.createdAt || 0
const nameOf = (space) => String(space.label || space.id || '')
// A card with a cover or a published project has something to look at; a blank
// one is demoted rather than hidden, which is what the grid has always done.
const hasSomethingToShow = (space) => Boolean(space.previewImageAssetId || space.publishedProjectId)

const STATE_ORDER = { open: 0, nodoor: 1, private: 2 }

export const filterSpaces = (spaces, filterKey) => {
    const key = normalizeFilter(filterKey)
    if (key === 'all') return [...spaces]
    return spaces.filter(s => spaceState(s) === key)
}

export const arrangeSpaces = (spaces, arrangeKey) => {
    const key = normalizeArrange(arrangeKey)
    const list = [...spaces]
    if (key === 'name') {
        return list.sort((a, b) => nameOf(a).localeCompare(nameOf(b), undefined, { sensitivity: 'base' }))
    }
    if (key === 'state') {
        return list.sort((a, b) =>
            STATE_ORDER[spaceState(a)] - STATE_ORDER[spaceState(b)]
            || nameOf(a).localeCompare(nameOf(b), undefined, { sensitivity: 'base' }))
    }
    return list.sort((a, b) =>
        Number(hasSomethingToShow(b)) - Number(hasSomethingToShow(a))
        || touchedAt(b) - touchedAt(a))
}

export const applyView = (spaces, { arrange, filter } = {}) =>
    arrangeSpaces(filterSpaces(spaces, filter), arrange)

// How many of each state are in a list — the count beside each filter chip, so
// "Needs a door" is visible as a number before it is clicked.
export const countStates = (spaces) => {
    const counts = { all: spaces.length, open: 0, nodoor: 0, private: 0 }
    for (const s of spaces) counts[spaceState(s)] += 1
    return counts
}
