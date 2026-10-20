'use strict';
// WHO HOLDS EACH MANUAL CHANNEL. The held (raw) layer is one per desk and every session
// writes into it: the operator's faders, a script aiming lamps, an agent checking a colour.
// It used to carry values only, so a caller that "released its holds" with {clear:true}
// released everybody's — on 2026-10-17 that put out the operator's live laser settings.
//
// Every held channel now carries an owner tag beside its value: `state.rawOwners[key]`,
// keyed like `state.raw` (`universe:channel`). The tag is the caller's own (a session or
// client id); a caller that names none is "owner", which is what the desk's own interface
// is. A release lets go of the caller's channels only. Letting go of somebody else's needs
// `all: true`, said out loud. Setting a channel takes it: the last hand on a fader holds it,
// as it always did, and a later release by the previous holder no longer reaches it.
//
// `state.raw` stays the plain value map the engine renders and a scene captures, so nothing
// that only reads values had to change.

const DEFAULT_OWNER = 'owner';
const OWNER_RE = /^[A-Za-z0-9._:@-]{1,40}$/;

// The caller's tag: absent = "owner"; anything given must be a short plain name. A bad tag
// is an error, not "owner" — a typo must never let a script release the operator's holds.
function holdOwner(v) {
  if (v == null || v === '') return DEFAULT_OWNER;
  const s = String(v).trim();
  return OWNER_RE.test(s) ? s : null;
}

function ownerOf(state, key) {
  const o = state.rawOwners && state.rawOwners[key];
  return typeof o === 'string' && o ? o : DEFAULT_OWNER;
}

// The owners as stored: one tag per held channel, nothing for a channel no longer held, and
// "owner" for one a show file written before tags carried none for.
function sanitizeRawOwners(owners, raw) {
  const out = {};
  for (const key of Object.keys(raw || {})) {
    const o = owners && typeof owners === 'object' ? holdOwner(owners[key]) : null;
    out[key] = o || DEFAULT_OWNER;
  }
  return out;
}

function ensureOwners(state) {
  if (!state.rawOwners || typeof state.rawOwners !== 'object') state.rawOwners = {};
  return state.rawOwners;
}

// Hold one channel at a value, for `owner`. Taking a channel someone else held moves it to
// the new hand.
function hold(state, key, value, owner = DEFAULT_OWNER) {
  ensureOwners(state)[key] = owner;
  state.raw[key] = value;
}

// Let go of one channel — only if `owner` holds it, unless `all`. Returns what happened:
// 'released', 'free' (nobody held it) or the tag of the holder it was left with.
function release(state, key, owner = DEFAULT_OWNER, all = false) {
  if (!(key in state.raw)) return 'free';
  const by = ownerOf(state, key);
  if (!all && by !== owner) return by;
  delete state.raw[key];
  if (state.rawOwners) delete state.rawOwners[key];
  return 'released';
}

// Let go of many: `owner`'s channels (every universe, or just `universe`), or everybody's
// with `all`. Returns { released, kept } — kept counts the channels left, by holder, so a
// reply can say who still has the universe.
function releaseHolds(state, { owner = DEFAULT_OWNER, all = false, universe = null } = {}) {
  const prefix = universe != null ? (universe | 0) + ':' : null;
  let released = 0;
  const kept = {};
  for (const key of Object.keys(state.raw)) {
    if (prefix && !key.startsWith(prefix)) continue;
    const r = release(state, key, owner, all);
    if (r === 'released') released++;
    else if (r !== 'free') kept[r] = (kept[r] || 0) + 1;
  }
  return { released, kept };
}

// A scene's holds replace the recalling hand's own, and only those: everybody else's stay,
// except on a channel the scene itself holds — the scene's value wins there, as the newest
// hand on it. Returns how many of `owner`'s holds the recall let go of.
function recallHolds(state, sceneRaw, owner = DEFAULT_OWNER) {
  const before = new Set(Object.keys(state.raw).filter((k) => ownerOf(state, k) === owner));
  const raw = {};
  const owners = {};
  for (const key of Object.keys(state.raw)) {
    const by = ownerOf(state, key);
    if (by === owner) continue;
    raw[key] = state.raw[key];
    owners[key] = by;
  }
  for (const [key, value] of Object.entries(sceneRaw || {})) {
    raw[key] = value;
    owners[key] = owner;
  }
  state.raw = raw;
  state.rawOwners = owners;
  let released = 0;
  for (const key of before) if (!(key in raw)) released++;
  return released;
}

// Held channels counted by holder: { owner: 12, 'la40-player': 14 }.
function holdsByOwner(state) {
  const out = {};
  for (const key of Object.keys(state.raw || {})) {
    const by = ownerOf(state, key);
    out[by] = (out[by] || 0) + 1;
  }
  return out;
}

module.exports = {
  DEFAULT_OWNER, holdOwner, ownerOf, sanitizeRawOwners, hold, release, releaseHolds, recallHolds, holdsByOwner,
};
