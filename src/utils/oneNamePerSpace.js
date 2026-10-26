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

// THE BRAND ONCE: a code carve-out that the dictionary does not allow, kept until the owner decides (PR #1142).
// The platform's own space is labelled "di.iiii", like the wordmark the bar already leads with and the start of index.html's
// title, so the furniture says the brand once and does not repeat it as the name of a space: no second "di.iiii", no id, no
// address, and no link of its own to the space in the bar (the wordmark leads to /spaces). docs/ai/vocabulary.md ("One name
// per space") says a stored name that is simply wrong (its own example is a space labelled "di.iiii") is fixed in data,
// "not a code carve-out", and docs/ai/sessions/fix-one-name-per-space.md (2026-09-15) lists `main` labelled "di.iiii" as the
// owner's call. The test is on the label, in any letter case, not on the id: ANY space labelled "di.iiii" is treated the
// same. To drop it: relabel the space (spaces/main/di-space.space.json) and delete isPlatformName and the lines that call
// it (in SurfaceBar.jsx, and in spaceTabTitle below).
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
