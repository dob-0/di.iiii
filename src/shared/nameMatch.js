// WHICH ONE DID THEY MEAN? — one rule, everywhere a live input is named.
//
// A show rig names its inputs instead of pointing at them. A camera device id
// belongs to one browser profile on one machine, and an NDI® address is chosen
// by the sender — neither can be written down on the desk and still mean
// anything on the machine that draws the wall. So a `stream` surface stores
// what the input is CALLED ("OBS Virtual Camera") and an `ndi` surface stores
// the source's NAME ("AYLMO (td_out_windows)"), and each machine resolves that
// text against its own list when it draws.
//
// The rule: trimmed and case-insensitive, an EXACT name first, then the first
// one that CONTAINS it — so "td_out" is enough for "AYLMO (td_out_windows)",
// and a source genuinely called "td" still wins over a longer name that merely
// contains those two letters.
//
// Exact-first is not a nicety. On a rig where one sender is called "td" and
// another "AYLMO (td_out_windows)", a plain "contains" would hand the wall
// whichever the finder happened to list first, and it would change between
// nights.
//
// It is also the security boundary of the NDI lane: `items` is ONLY ever a list
// the finder itself discovered, so the most a client's string can do is select
// one of them. An address a client names matches nothing — addresses are not
// read here at all.
//
// TWIN FILE: shared/nameMatch.cjs is the server's copy of this module, because
// serverXR is CommonJS and Vite does not transform a local .cjs for the
// browser (checked, 2026-09-20: `vite build` bundles one, `vite dev` serves it
// raw and `module.exports` throws). src/shared/nameMatch.test.js runs both
// copies over the same table and fails if they ever disagree — the same
// mirror-plus-contract-test shape as shared/projectSchema.cjs and
// shared/reservedSegments.cjs.

/**
 * @param {Array} items the list to choose from — never anything a client supplied
 * @param {string} name what was typed on the desk
 * @param {(item: any) => string} read the field that carries the name
 * @returns {any|null} the item, or null rather than a guess
 */
export const pickByName = (items = [], name = '', read = (item) => item?.name) => {
    const wanted = String(name || '').trim().toLowerCase()
    if (!wanted) return null
    const list = Array.isArray(items) ? items : []
    const text = (item) => String(read(item) || '').toLowerCase()
    return list.find((item) => text(item) === wanted)
        || list.find((item) => text(item).includes(wanted))
        || null
}

/** The same rule, for anything whose name is its `label` (a browser device). */
export const pickByLabel = (items = [], name = '') => pickByName(items, name, (item) => item?.label)
