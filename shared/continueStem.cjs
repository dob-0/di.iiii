'use strict'

// CONTINUE, NEVER RECREATE — one rule for "is this the same thing again?"
//
// Owner 2026-11-02: a place is ONE space with its projects inside; a job is ONE
// project continued. The audit (docs/ai/decisions/2026-11-02-continue-never-recreate.md)
// found a second space for one place, 14 moxir "version" projects and so on, each made
// because nothing at creation time asked "does this exist?". This file answers that
// question the same way for the server doors (POST /api/spaces, /api/spaces/bundle,
// POST /api/spaces/:id/projects), `di new` and scripts/place/import.mjs.
//
// CJS because serverXR is CJS; scripts import it with createRequire (the shape of
// shared/spaceBlurb.cjs and shared/nameMatch.cjs).

// Trailing decorations that make a restart look new: -3d, -test, -copy, -vN, -N, a date.
const TAIL = /(?:^|-)(?:3d|test|copy|v\d+(?:-\d+)*|\d{1,3}|\d{4}-\d{2}-\d{2}|\d{8})$/
const MIN_STEM = 3
const FUZZY_MIN = 8

/** lower-case, words joined by "-", decorations stripped from the end. */
const stemOf = (value) => {
  let s = String(value || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  // A date may sit anywhere; strip it wherever it is.
  s = s.replace(/(?:^|-)\d{4}-\d{2}-\d{2}(?=-|$)/g, '').replace(/^-+|-+$/g, '')
  for (let i = 0; i < 6; i += 1) {
    const next = s.replace(TAIL, '').replace(/^-+|-+$/g, '')
    if (next === s || next.length < MIN_STEM) break
    s = next
  }
  return s
}

const distanceAtMostOne = (a, b) => {
  if (a === b) return true
  if (Math.abs(a.length - b.length) > 1) return false
  let i = 0
  while (i < a.length && i < b.length && a[i] === b[i]) i += 1
  if (a.length === b.length) return a.slice(i + 1) === b.slice(i + 1)
  return a.length > b.length ? a.slice(i + 1) === b.slice(i) : b.slice(i + 1) === a.slice(i)
}

/** Do two names carry the same stem (equal, or one typo apart when long enough)? */
const sameStem = (a, b) => {
  const x = stemOf(a)
  const y = stemOf(b)
  if (x.length < MIN_STEM || y.length < MIN_STEM) return false
  if (x === y) return true
  return x.length >= FUZZY_MIN && y.length >= FUZZY_MIN && distanceAtMostOne(x, y)
}

/**
 * The first existing item whose id or label shares a stem with any of `names`.
 * @param {string[]} names what the new thing is called (id, label, title)
 * @param {Array<{id:string,label?:string,title?:string}>} items existing ones
 */
const findSimilar = (names, items = []) => {
  const wanted = (Array.isArray(names) ? names : [names]).filter(Boolean)
  for (const item of Array.isArray(items) ? items : []) {
    const theirs = [item?.id, item?.label, item?.title].filter(Boolean)
    if (wanted.some((w) => theirs.some((t) => sameStem(w, t)))) return item
  }
  return null
}

/** Only a written reason lets a duplicate through. */
const newAnywayReason = (value) => {
  const text = typeof value === 'string' ? value.trim() : ''
  return text.length >= 3 ? text : ''
}

const spaceHint = (existing) =>
  `continue it: di.iiii/${existing}. To add this work as a project of that space: di move PROJECT --to ${existing} (or POST /api/spaces/${existing}/projects). A real second space needs newAnyway with a reason.`

module.exports = { stemOf, sameStem, findSimilar, newAnywayReason, spaceHint }
