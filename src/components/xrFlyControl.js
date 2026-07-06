// VR fly: right-thumbstick Y → vertical velocity sign. Kept as a pure function
// because this exact sign has been flipped multiple times by sessions
// reasoning from assumption — once guessing "typical gamepad" (correct, by
// luck), once "fixing" it with a comment claiming Quest verification that
// never happened.
//
// REAL-HARDWARE TRUTH (user-verified on a headset, 2026-07-05, confirmed
// correct independently 3 times since): the xr-standard-thumbstick yAxis is
// NEGATIVE when pushed up. A 2026-07-06 report claimed this had flipped, but
// it arrived in the same round as an impossible report (both possible turn
// signs AND both possible fly signs reported "still wrong"), right after a
// commit that changed only a debug text display with zero functional change
// -- treated as an unreliable test round, not a real regression. Reverted to
// this original, repeatedly-confirmed sign. Do not change without a fresh,
// deliberate physical-headset re-test; the unit test encodes this convention.
export const FLY_STICK_DEADZONE = 0.15
export const MOVE_STICK_DEADZONE = 0.1

export const flyVertFromStick = (yAxis, deadzone = FLY_STICK_DEADZONE) =>
    Math.abs(yAxis) > deadzone ? -yAxis : 0

// Left-stick translation mapping. REAL-HARDWARE TRUTH (headset, 2026-07-05):
// push up = negative yAxis = forward (+). Forward here is +toward view,
// strafe +to the right of view (right = forward × up). Do not change these
// signs without re-testing on a physical headset.
//
// REAL-HARDWARE TRUTH, STRAFE (headset, 2026-07-06): the 2026-07-05 session's
// claim that push-left reads as POSITIVE xAxis on-device was never actually
// re-verified and was wrong — confirmed backwards on real hardware (pushing
// left strafed right). This device follows the standard Gamepad-API
// convention (push left = negative xAxis), so `strafe: xAxis` (no negation)
// is correct. Do not flip this again without re-testing on a physical
// headset.
export const moveFromStick = (xAxis, yAxis, deadzone = MOVE_STICK_DEADZONE) =>
    (Math.abs(xAxis) > deadzone || Math.abs(yAxis) > deadzone)
        ? { forward: -yAxis || 0, strafe: xAxis || 0 }
        : { forward: 0, strafe: 0 }

// Right-stick X drives yaw through the library's built-in smooth-turn logic
// (`useXRControllerLocomotion`), which turns based on the raw xAxis sign.
// REAL-HARDWARE TRUTH (headset, 2026-07-06): with this device's axis
// convention, the library's default direction was backwards -- push left
// turned the view right (the very first VR report in this file's history).
// Negating the speed passed to the library flips its turn direction without
// forking it -- geometrically verified (increasing yaw turns the view away
// from its instantaneous right vector, i.e. left). A follow-up report that
// this was "still wrong" arrived bundled with an impossible one (fly also
// reported wrong in both directions, right after a debug-only, non-
// functional commit) -- treated as an unreliable test round. This remains
// the best-evidenced direction until a fresh, deliberate re-test says
// otherwise. Do not change without re-testing on a physical headset.
export const xrTurnSpeed = (baseSpeed) => -baseSpeed
