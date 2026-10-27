// One name per space (owner, 2026-09-14; docs/ai/vocabulary.md, "One name per space"): a space's NAME, its label, is the one
// word di.iiii's own furniture says for it, on every page of the space and whatever address was typed to reach it. A space
// nobody named shows its address (spaceAddress.js: its slug, else its id).
//
// This file is that rule for two pieces of furniture: the surface bar (components/SurfaceBar.jsx) and the browser tab
// (SpaceSurfaceApp, SpaceContentsPage, PublicProjectViewer). The /spaces card has a rule of its own in
// studio/utils/spaceNames.js: the name, else the id (not the address). It is not changed here. Pure.
//
// Why it is one file: measured 2026-10-26 on 19 addresses, the platform's own space read "di.iiii · main",
// "di.iiii · di-iiii" and "di.iiii · di.iiii" in the bar, and "di.iiii — di.iiii" in the tab, depending on the page — each
// surface handed the bar the id, the word that was typed, or a carve-out of its own.

// The platform's own space, by its id. Its name is data like any space's (spaces/main/di-space.space.json: "Home",
// decided 2026-10-27; it was "di.iiii", so the bar read "di.iiii · di.iiii" and a carve-out on the name hid it). The id
// matters for one thing only: the tab of that space's pages stays index.html's title, the front door's own.
export const PLATFORM_SPACE_ID = 'main'

const clean = (value) => (typeof value === 'string' ? value.trim() : '')

// The word the furniture says for a space: its name, else its address.
export const spaceWordFor = (label, address) => clean(label) || clean(address)

// The tab of a page of a space: "<name> — di.iiii", or "<project> — <name> — di.iiii" when the address named the project.
// null leaves the tab as index.html set it: for the platform's own space (the front door keeps index.html's title) and
// while nothing is known (a tab is never blanked, and never flashes a guess). `spaceId` is the record's id, asked of the
// space, never the word that was typed (/di-iiii is the same space as /main).
export const spaceTabTitle = ({ spaceId, label, address, projectTitle } = {}) => {
    const name = spaceWordFor(label, address || spaceId)
    if (!name || spaceId === PLATFORM_SPACE_ID) return null
    const project = clean(projectTitle)
    return project ? `${project} — ${name} — di.iiii` : `${name} — di.iiii`
}
