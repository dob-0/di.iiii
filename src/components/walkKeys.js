// The walk mode's keys that a hint line has to say, in one place, so the code and the words cannot drift apart.
// Round 1 of the head light moved Fly's key in the code and left the old key in three hints and two wiki articles
// (PR #1170, verification of 2026-10-28); this file, walkKeys.test.js and walkKeysSeams.test.js close that.
//
//   F · fly         Fly, in every project, as it always was. The head light never moves it.
//   L · head light  the head light (headLight.js), only in a project that turns the light on.
//
// Owner, 2026-10-28 (ledger N1445): "if every one has their own lets keep our how that is" -- where there is no common
// standard, di.iiii keeps its own keys. While flying, E is up and Q is down (Unity, Unreal, Roblox Studio and Blender agree;
// owner N1445.1, 2026-10-29); the table is docs/ai/keys.md.
import { HEAD_LIGHT_KEY } from './headLight.js'
import { physicalKey } from './physicalKey.js'

export const FLY_KEY = 'f'

/** Fly's key: the F key, either case, on any keyboard layout (physicalKey.js). The same in every project. (Typing into a field is ruled out by the caller: walkKeyboard.js.) */
export const isFlyKey = (event) => physicalKey(event) === FLY_KEY

// Between two keys on a hint line: the line has always been written with non-breaking spaces round the dot.
export const HINT_SEPARATOR = ' \u00A0·\u00A0 '

/**
 * The key words of a hint line: "F · fly", or "L · head light · F · walk" while flying in a project with a head light.
 * The head light's key shows only where the project turns the light on. The line is upper-cased by its CSS.
 *
 * @param {{ headLight?: boolean, flying?: boolean }} state
 * @returns {string}
 */
// Fly's up / down keys. Space and C were always up and down; E up and Q down is the common standard, so it now leads.
export const ALTITUDE_KEYS = Object.freeze({ up: [' ', 'e'], down: ['q', 'c'] })
// Archive (nothing we have is lost): the pair before 2026-10-29, Q up and E down. A caller can still pass it as `altitudeKeys`.
export const LEGACY_ALTITUDE_KEYS = Object.freeze({ up: [' ', 'q'], down: ['e', 'c'] })
// The words for the altitude keys on the hint line while flying.
export const ALTITUDE_HINT_TEXT = 'Space/E · up' + HINT_SEPARATOR + 'C/Q · down'

export const walkKeyHintText = ({ headLight = false, flying = false, fly = true } = {}) => [
    ...(headLight ? [`${HEAD_LIGHT_KEY.toUpperCase()} · head light`] : []),
    ...(fly ? [`${FLY_KEY.toUpperCase()} · ${flying ? 'walk' : 'fly'}`] : [])
].join(HINT_SEPARATOR)
