'use strict';

// TEST MOVE — "which way does this head turn?" One press swings one axis of the chosen
// lights a little way and back, so a head that turns the other way than its neighbours
// (Invert) or tilts when pan was asked for (Swap) shows itself while the operator watches.
//
// The swing is added on the DESK side, before Swap, Invert, the min/max mapping and the
// trim (engine.js), so it moves the head exactly the way the Pan or Tilt fader would:
// after Invert is ticked the same press turns the head the other way, which is the check.
//
// It is live only, like Identify: fixtureId -> { axis, from, until }, never in show.json,
// never in a scene, and the head is back on its own position the moment it ends. The
// swing is a raised cosine from 0 to `steps` and back, a whole number of times, so it
// starts and ends at rest with no jump.

const TEST_MOVE = Object.freeze({
  steps: 20,        // coarse DMX steps at the top of the swing (about 40 degrees on a 540-degree pan)
  periodMs: 2000,   // one swing out and back
  seconds: 4,       // a press, unless the call says otherwise
  maxSeconds: 10,
});
const AXES = ['pan', 'tilt'];

/**
 * The swing at server time `now` for one live entry, or null when there is none or it is over.
 * @returns {{axis: 'pan'|'tilt', steps: number}|null} steps in coarse DMX steps, 0..TEST_MOVE.steps
 */
function testMoveAt(entry, now) {
  if (!entry || !AXES.includes(entry.axis) || !(entry.until > now)) return null;
  const t = Math.max(0, now - entry.from) % TEST_MOVE.periodMs;
  return { axis: entry.axis, steps: TEST_MOVE.steps * (1 - Math.cos(2 * Math.PI * t / TEST_MOVE.periodMs)) / 2 };
}

/**
 * A press, as the route receives it: { ids, axis, seconds } -> { axis, ms } or { error }.
 * The length is rounded up to whole swings so the head always ends where it started.
 */
function readTestMove(body) {
  const axis = body && body.axis;
  if (!AXES.includes(axis)) return { error: 'axis must be pan or tilt' };
  const s = Math.max(1, Math.min(TEST_MOVE.maxSeconds, +body.seconds || TEST_MOVE.seconds));
  return { axis, ms: Math.ceil((s * 1000) / TEST_MOVE.periodMs) * TEST_MOVE.periodMs };
}

module.exports = { TEST_MOVE, testMoveAt, readTestMove };
