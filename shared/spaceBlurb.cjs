'use strict'

// A space's one line for visitors: what the space is, in words a stranger can
// read. It is shown on the space's card on /spaces and is the description a
// share card and a search result carry (serverXR/src/routes/ogRoutes.js).
//
// Before it existed, 10 of the 11 public cards on /spaces said nothing about
// what was inside, and every share card read "<name> — a space on di.iiii."
// (marketing audit 2026-10-21, G23).
//
// 160 characters: about what a search result shows before it cuts a
// description, and what fits a share card's two lines. One line: newlines and
// runs of spaces collapse, because the card and the meta tag are both one line.
//
// The browser keeps the same number in src/studio/utils/spaceBlurb.js;
// src/studio/utils/spaceBlurb.test.js reads this file and fails if they differ.

const SPACE_BLURB_MAX = 160

// Returns the cleaned line, null to clear it, or undefined when the value is
// not acceptable (not a string, or longer than SPACE_BLURB_MAX once cleaned).
const normalizeSpaceBlurb = (value) => {
  if (value === null) return null
  if (typeof value !== 'string') return undefined
  const line = value.replace(/\s+/g, ' ').trim()
  if (!line) return null
  if (line.length > SPACE_BLURB_MAX) return undefined
  return line
}

module.exports = { SPACE_BLURB_MAX, normalizeSpaceBlurb }
