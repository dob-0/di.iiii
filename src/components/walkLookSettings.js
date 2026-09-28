// The viewer's look settings, as the Walker's movement loop reads them.
// The Look panel owns them (lookSettings.js, per viewer); the movement loop only
// reads `.bob` (0 = off, 1 = full BOB_AMPLITUDE). Default: bob OFF.
import { getHeadBob } from './lookSettings.js'

const ON = Object.freeze({ bob: 1 })
const OFF = Object.freeze({ bob: 0 })
export const DEFAULT_LOOK_SETTINGS = OFF

export function getLookSettings() {
    return getHeadBob() ? ON : OFF
}
