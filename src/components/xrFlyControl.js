// VR fly: right-thumbstick Y → vertical velocity sign. Kept as a pure function
// because this exact sign has been flipped twice by sessions reasoning from
// assumption — once guessing "typical gamepad" (correct, by luck), once
// "fixing" it with a comment claiming Quest verification that never happened.
//
// REAL-HARDWARE TRUTH (user-verified on a headset, 2026-07-05): the WebXR
// xr-standard-thumbstick yAxis reads NEGATIVE when pushed up (same as the
// Gamepad API convention). Ascend = -yAxis. Do not change this sign without
// re-testing on a physical headset; the unit test encodes this convention.
export const FLY_STICK_DEADZONE = 0.15
export const MOVE_STICK_DEADZONE = 0.1

export const flyVertFromStick = (yAxis, deadzone = FLY_STICK_DEADZONE) =>
    Math.abs(yAxis) > deadzone ? -yAxis : 0

// Left-stick translation mapping, same hardware convention (Gamepad API):
// push up = negative yAxis = move forward (+), push right = positive xAxis =
// strafe right (+). The library's useXRControllerLocomotion translation
// mirrored strafe on real hardware (verified 2026-07-05: push left slid
// right), so translation is ours: these axes drive movement along the
// camera's horizontal forward and its cross-product right vector.
export const moveFromStick = (xAxis, yAxis, deadzone = MOVE_STICK_DEADZONE) =>
    (Math.abs(xAxis) > deadzone || Math.abs(yAxis) > deadzone)
        ? { forward: -yAxis || 0, strafe: xAxis }
        : { forward: 0, strafe: 0 }
