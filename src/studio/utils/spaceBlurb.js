// The browser's copy of shared/spaceBlurb.cjs's limit: a space's one line for
// visitors, shown on its card and used as its share card's description. The
// server is the judge (it refuses a longer line with a 400); this number only
// lets the prompt say the limit before the owner types past it.
// spaceBlurb.test.js fails if the two numbers differ.
export const SPACE_BLURB_MAX = 160
