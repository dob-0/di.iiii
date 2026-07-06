// VR fly: right-thumbstick Y → vertical velocity sign. Kept as a pure function
// because this exact sign has been flipped multiple times by sessions
// reasoning from assumption — once guessing "typical gamepad" (correct, by
// luck), once "fixing" it with a comment claiming Quest verification that
// never happened.
//
// REAL-HARDWARE TRUTH (user-verified on a headset, 2026-07-07): the
// 2026-07-05 claim (yAxis negative when pushed up) held for a while but was
// re-tested live and found backwards — push up now descended. Ascend = yAxis
// (no negation). Do not change this sign without re-testing on a physical
// headset; the unit test encodes this convention.
export const FLY_STICK_DEADZONE = 0.15
export const MOVE_STICK_DEADZONE = 0.1

export const flyVertFromStick = (yAxis, deadzone = FLY_STICK_DEADZONE) =>
    Math.abs(yAxis) > deadzone ? yAxis : 0

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
// REAL-HARDWARE TRUTH (headset, 2026-07-07): the 2026-07-06 negation was
// re-tested live and the turn was still backwards, so this reverts to the
// library's own default (unmodified) direction. Do not change without
// re-testing on a physical headset.
export const xrTurnSpeed = (baseSpeed) => baseSpeed
