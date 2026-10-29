// THE MOVES: the named ways the camera moves, each one frozen once the owner has chosen it.
// Owner, 2026-10-14, about the Studio camera movement on his test copy (the standard move, PR #919, dev 38d22dcf):
//   "i like the current camera movement ... can we name it and make it default" and
//   "i like what we have now ... i know there are some other agents work on this too. lets have this version as a free move,
//    and other ... just like move 1, move 2".
// THE RULE: Move 1 is the owner's movement and it NEVER changes. A new behaviour is a NEW entry here (Move 2, Move 3 ...) plus
// its own branch in the engine (useCameraNavigation.js), beside Move 1, never an edit of it. src/studio/navigation/move1.golden.test.js
// freezes Move 1's numbers; if it fails, you changed Move 1: put it back and add a new move instead.
// (NAVIGATION_PRESETS 'studio' / 'blender' in mappings.js are mouse-button maps, a different thing.)
// The Studio's View | Edit switch is not a move either (owner 2026-10-28): in both the camera is Move 1; Edit only adds that a pull
// on the selected thing moves it (pullToMove.js), a branch in the engine before Move 1's, which it never changes.
export const MOVES = Object.freeze([
    Object.freeze({
        id: 'move-1',
        label: 'Move 1',
        since: '2026-10-14',
        about: 'Same speed in every direction · Auto speed from the size of the place',
    }),
])

export const DEFAULT_MOVE_ID = 'move-1'

// A known move's id, or the default for anything else (junk, null, a move this build does not have). Pure.
export function normalizeMoveId(value, moves = MOVES) {
    return moves.some((m) => m.id === value) ? value : DEFAULT_MOVE_ID
}

// The move an id names (the default for junk). Pure.
export function moveFor(id, moves = MOVES) {
    return moves.find((m) => m.id === normalizeMoveId(id, moves)) ?? moves[0]
}
