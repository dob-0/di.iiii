'use strict';
// WHAT A CHANNEL IS — the type system every other file switches on.
//
// Its own module because the renderer, the content model (looks.js) and the interface
// all need the same answer, and a channel that is a "control" in one file and an
// "emitter" in another is a fixture that dims when it should not.

const ROLE_DEFAULTS = {
  dimmer: 255, r: 255, g: 255, b: 255, w: 0, a: 0, y: 0,
  warm: 255, cool: 0, strobe: 0, pan: 128, tilt: 128,
  // Emitters beyond RGB that real fixtures carry. They start dark: a par that came up
  // with its UV on because that is the channel default would be a nasty surprise.
  uv: 0, lime: 0,
  // 16-bit fine channels. Zero is the right default — it is the fractional part of the
  // coarse channel above it, so zero simply means "no offset".
  panFine: 0, tiltFine: 0, dimmerFine: 0,
  // Control channels: no light of their own, so they pass straight through untouched by
  // the dimmer, the master or blackout. Zero is the safe end of all of these — the
  // fixture sits in manual rather than running a built-in program.
  macro: 0, speed: 0, auto: 0, sound: 0, gobo: 0, gobo2: 0,
  rotation: 0, prism: 0, zoom: 0, focus: 0, iris: 0, frost: 0, control: 0,
  // Colour wheel — a stepped wheel, not an emitter, so it passes through the dimmer
  // untouched the way the other wheels do.
  color: 0,
  // Spares, for the channels on a real chart that have no generic equivalent: a second
  // prism, a reset, a channel the manual leaves blank. They exist so those channels can
  // each hold their own value — a profile is not allowed to repeat a role, because one
  // value driving two channels moves them together invisibly.
  aux1: 0, aux2: 0, aux3: 0, aux4: 0, aux5: 0, aux6: 0, aux7: 0, aux8: 0,
  // Sixteen, not eight, since fixtures arrive from a library now: a 32-channel head
  // full of macro, reset and effect channels needs somewhere for each of them to live,
  // and a role that repeats would drive two channels from one value invisibly.
  aux9: 0, aux10: 0, aux11: 0, aux12: 0, aux13: 0, aux14: 0, aux15: 0, aux16: 0,
};
// Roles that carry light output: scaled by the fixture dimmer (when the fixture has no
// dimmer channel of its own), by the master fader and by blackout.
const LIGHT_ROLES = new Set(['r', 'g', 'b', 'w', 'a', 'y', 'warm', 'cool', 'uv', 'lime']);
const LEVEL_ROLES = new Set(['dimmer']);
const POSITION_ROLES = new Set(['pan', 'tilt']);
const FINE_ROLES = new Set(['panFine', 'tiltFine', 'dimmerFine']);

// What kind of thing a channel is, which is what decides whether the dimmer, the master
// and blackout touch it. `render` below switches on this rather than testing the sets
// directly, and it is published on /api/state as `roleKinds` — so the interface can ask
// what a channel is instead of keeping its own copy of the answer and drifting from it.
// Anything unrecognised is a control channel: a plain fader that passes straight through.
function roleKind(role) {
  if (LEVEL_ROLES.has(role)) return 'level';
  if (POSITION_ROLES.has(role)) return 'position';
  if (LIGHT_ROLES.has(role)) return 'emitter';
  if (FINE_ROLES.has(role)) return 'fine';
  return 'control';
}

function roleKinds() {
  const out = { emitter: [], level: [], position: [], control: [], fine: [] };
  for (const role of Object.keys(ROLE_DEFAULTS)) out[roleKind(role)].push(role);
  return out;
}

module.exports = {
  ROLE_DEFAULTS, LIGHT_ROLES, LEVEL_ROLES, POSITION_ROLES, FINE_ROLES, roleKind, roleKinds,
};
