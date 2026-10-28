// The one sentence an empty space says, on its own page (EmptySpaceView) and on
// its list of projects (SpaceContentsPage). One empty state, one voice (audit
// F070, 2026-10-28).
//
// The second half speaks about the owner, so only a visitor reads it. The owner
// (anyone who can edit here) reads "Nothing here yet." and the way to start;
// "The owner has not shown anything" read to the owner sounds like someone else
// (S07 review, 2026-10-28).
export const EMPTY_SPACE_SENTENCE = 'Nothing here yet.'
export const EMPTY_SPACE_VISITOR_TAIL = 'The owner has not shown anything.'

export const emptySpaceSentence = (canEdit) =>
    canEdit ? EMPTY_SPACE_SENTENCE : `${EMPTY_SPACE_SENTENCE} ${EMPTY_SPACE_VISITOR_TAIL}`
