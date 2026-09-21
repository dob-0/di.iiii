'use strict'

// WHICH ONE DID THEY MEAN? — one rule, everywhere a live input is named.
//
// TWIN FILE: this is the server's copy of src/shared/nameMatch.js. Read that
// one for why the rule is what it is; keep the two bodies identical.
// src/shared/nameMatch.test.js runs both over the same table and fails if they
// ever disagree.
//
// CJS because serverXR is CJS, and a local .cjs cannot simply be imported by
// the client instead: Vite's dev server serves it raw (checked 2026-09-20), so
// `module.exports` would throw in the browser even though `vite build` bundles
// it fine. Two files, one contract test — the same shape as
// shared/projectSchema.cjs and shared/reservedSegments.cjs.

/**
 * @param {Array} items the list to choose from — never anything a client supplied
 * @param {string} name what was typed on the desk
 * @param {(item: any) => string} read the field that carries the name
 * @returns {any|null} the item, or null rather than a guess
 */
const pickByName = (items = [], name = '', read = (item) => item && item.name) => {
  const wanted = String(name || '').trim().toLowerCase()
  if (!wanted) return null
  const list = Array.isArray(items) ? items : []
  const text = (item) => String(read(item) || '').toLowerCase()
  return list.find((item) => text(item) === wanted)
    || list.find((item) => text(item).includes(wanted))
    || null
}

/** The same rule, for anything whose name is its `label` (a browser device). */
const pickByLabel = (items = [], name = '') => pickByName(items, name, (item) => item && item.label)

module.exports = { pickByName, pickByLabel }
