// WHICH ONE DID THEY MEAN? — the CLI's copy of src/shared/nameMatch.js.
//
// A third twin, and the reason is the install layout: the packed CLI lives at
// `<version>/cli` beside `<version>/shared`, while in the repo it is
// `scripts/di`, two levels above `shared/` — no single relative import
// resolves in both places, and a CLI that only worked from a checkout would
// be a stage box that only worked for developers. So the six lines live here
// too, and src/shared/nameMatch.test.js runs all three copies over the same
// table and fails if they ever disagree.
//
// The rule: trimmed and case-insensitive, an EXACT name first, then the
// first one that CONTAINS it. Exact-first matters on a rig where one output
// is "HDMI-1" and another "HDMI-1-0".

export const pickByName = (items = [], name = '', read = (item) => item?.name) => {
    const wanted = String(name || '').trim().toLowerCase()
    if (!wanted) return null
    const list = Array.isArray(items) ? items : []
    const text = (item) => String(read(item) || '').toLowerCase()
    return list.find((item) => text(item) === wanted)
        || list.find((item) => text(item).includes(wanted))
        || null
}

export const pickByLabel = (items = [], name = '') => pickByName(items, name, (item) => item?.label)
