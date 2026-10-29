// Decoration is not a reason to start a graphics card. The front page's moving
// room and the wiki's backdrop are pictures behind words; a help page, a phone
// on mobile data and a person who asked their system for less motion all pay
// for them in battery and attention (UX audit F138; WCAG 2.2.2 pause/stop/hide).
//
// Nothing is removed: `?scene=1` on either page brings the 3D back, so the old
// look is one address away. Without it the wiki and the front page stay flat;
// on the front page pressing the door ("Step inside") still brings the room.
const searchOf = (win) => (win && win.location ? win.location.search : '')

export const sceneForced = (win = typeof window !== 'undefined' ? window : null) =>
    new URLSearchParams(searchOf(win)).get('scene') === '1'

export const prefersReducedMotion = (win = typeof window !== 'undefined' ? window : null) =>
    Boolean(win?.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches)

// The wiki is for reading: flat unless asked.
export const wikiBackdropOn = (win) => sceneForced(win)

// The front page is flat until asked: ?scene=1, or the door. Reduced motion
// never overrides the door, only the idle decoration (and it is off anyway).
export const landingBackdropOn = (win) => sceneForced(win)
