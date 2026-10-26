// One name per space (owner, 2026-09-14; docs/ai/vocabulary.md, "One name per space"): a space's NAME, its label, is the one
// word di.iiii's own furniture says for it, on every page of the space and whatever address was typed to reach it. A space
// nobody named shows its address (spaceAddress.js: its slug, else its id).
//
// This file is that rule for two pieces of furniture: the surface bar (components/SurfaceBar.jsx) and the browser tab
// (SpaceSurfaceApp, SpaceContentsPage, PublicProjectViewer). The /spaces card keeps its own copy of the rule in
// studio/utils/spaceNames.js. Pure.
//
// Why it is one file: measured 2026-10-26 on 19 addresses, the platform's own space read "di.iiii · main",
// "di.iiii · di-iiii" and "di.iiii · di.iiii" in the bar, and "di.iiii — di.iiii" in the tab, depending on the page — each
// surface handed the bar the id, the word that was typed, or a carve-out of its own.

// The platform's own space is named after the brand. The bar already leads with "di.iiii" and index.html's title already
// starts with it, so the furniture says the brand once and does not repeat it as the name of a place.
export const PLATFORM_NAME = 'di.iiii'

// The platform's own space, by its id. A surface reached by the space's address (/di-iiii) is handed that word and not this
// id, which is why the name decides too: isPlatformName.
export const PLATFORM_SPACE_ID = 'main'

export const isPlatformName = (name) => typeof name === 'string' && name.trim().toLowerCase() === PLATFORM_NAME

const clean = (value) => (typeof value === 'string' ? value.trim() : '')

// The word the furniture says for a space: its name, else its address.
export const spaceWordFor = (label, address) => clean(label) || clean(address)

// The tab of a page of a space: "<name> — di.iiii", or "<project> — <name> — di.iiii" when the address named the project.
// null leaves the tab as index.html set it. That is the answer for the platform's own space (its name IS the brand, so the
// tab would read "di.iiii — di.iiii") and while nothing is known (a tab is never blanked, and never flashes a guess).
// `spaceId` is the id when the surface knows it; a word typed as the address is no id, and then the name decides.
export const spaceTabTitle = ({ spaceId, label, address, projectTitle } = {}) => {
    const name = spaceWordFor(label, address || spaceId)
    if (!name || spaceId === PLATFORM_SPACE_ID || isPlatformName(name)) return null
    const project = clean(projectTitle)
    return project ? `${project} — ${name} — di.iiii` : `${name} — di.iiii`
}
