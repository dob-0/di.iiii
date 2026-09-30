'use strict';
// AUTO-PATCH — a rig built in a room, patched on this desk.
// docs/architecture/RIG_BUILD.md §4 (in di.iiii); the rules are repeated here because
// this file also travels to the club's standalone install.
//
// A room (di.iiii's project document) holds lamps, each with a fixture TYPE and MODE.
// This takes the room's lamps and makes the desk agree: a fixture per lamp, at the
// lamp's own universe/address when it has one and it is free, otherwise at the next
// free address found by the desk's OWN allocator (engine.nextFreeAddress). The room
// then writes back what the desk decided. The desk allocates; the room records.
//
//   a lamp new to the desk              created (its address if free, else next free)
//   a new lamp carrying the address of  a COPY (duplicate/paste): next free address and
//     another lamp in the same room       a new index, as a console does on copy
//   a lamp whose address was typed      moved there if free; REFUSED and flagged if it
//     (`move: true`)                       collides with another fixture — nothing moves
//   a lamp whose room address differs   FLAGGED 'desk-differs'; neither side changes —
//     from the desk's, `move` not set      someone re-patched one of them and must choose
//   a lamp whose mode changed           its profile changes; if the new width collides,
//                                        REFUSED and flagged; nothing moves
//   a lamp with no footprint (the mode  its fixture (if any) removed, and flagged —
//     is unknown / owed)                   no address is ever invented
//   a rig fixture of this room whose    removed (the lamp was deleted), with `prune`
//     lamp is gone
//
// `repatch: true` lays the listed lamps out again from scratch (their fixtures removed
// first, their room addresses ignored) — with `group`, the "patch this group" action.
//
// `group: true` keeps each group (lamps sharing `group`) CONTIGUOUS in one universe:
// the lowest universe with a free run of the whole group's width, found with the same
// nextFreeAddress asked for the whole width. One data line per area, re-patchable as a
// block — the conventional way.
//
// Universes cross this boundary 1-based (as MVR and every crew count); the desk keeps
// its own 0-based numbers inside (U1 = desk universe 0, shown +1 on every page here).
//
// Every desk fixture made here carries `rigKey = "<project>:<entity>"`. The lamp's
// join in the room stays the fixture's `index`, so the room's live mirror and "Send
// positions to the desk" work unchanged.

const { ROLE_DEFAULTS } = require('./roles');

const MAX_UNIVERSE = 32767;
const PROFILE_NAME_RE = /[^A-Za-z0-9 _-]/g;

const profileNameFor = (code, mode) => {
  const clean = `${code} ${mode}`.replace(PROFILE_NAME_RE, '-').replace(/^[^A-Za-z0-9]+/, '').trim();
  return clean.slice(0, 24);
};

// Roles for a mode: the source's channel list when there is one, else ch1..chN with a
// label that says the list is owed — the footprint is enough to patch, not to program.
// A listed channel rests at its own `default` (a shutter where 0 = CLOSED rests open, a
// pan at centre); without one, at the desk's default for that role (pan/tilt 128 — home,
// not hard over to one end), else 0. An owed ch1..chN rests at 0.
function channelsFor(lamp) {
  const n = lamp.footprint;
  const listed = Array.isArray(lamp.channels) && lamp.channels.length === n ? lamp.channels : null;
  const roles = [];
  const labels = {};
  const defaults = {};
  for (let i = 0; i < n; i++) {
    const c = listed ? listed[i] : null;
    const role = c && typeof c.role === 'string' && /^[A-Za-z0-9][A-Za-z0-9_-]{0,23}$/.test(c.role) ? c.role : `ch${i + 1}`;
    roles.push(role);
    labels[role] = c && c.label ? String(c.label).slice(0, 24) : `Ch ${i + 1} (list owed)`;
    const own = c && Number.isFinite(+c.default) ? Math.max(0, Math.min(255, +c.default | 0)) : null;
    defaults[role] = own != null ? own : (c && ROLE_DEFAULTS[role] != null && role !== 'dimmer' ? ROLE_DEFAULTS[role] : 0);
  }
  return { roles, labels, defaults };
}

function rigPatch(ctx, body) {
  const { state, engine, PROFILES, addProfile, findProfile, makeFixture, customProfiles } = ctx;
  const project = typeof body.project === 'string' ? body.project.trim() : '';
  if (!project || project.includes(':') || project.length > 128) {
    return { status: 400, body: { error: 'a project id is needed (no ":" in it)' } };
  }
  const lamps = (Array.isArray(body.lamps) ? body.lamps : []).filter((l) => l && typeof l.key === 'string');
  const prefix = project + ':';
  for (const l of lamps) {
    if (!l.key.startsWith(prefix)) return { status: 400, body: { error: `lamp key ${l.key} is not in project ${project}` } };
  }
  const flags = [];
  const flag = (key, code, message) => flags.push({ key, code, message });
  const assignments = [];
  const removed = [];

  const widthOf = (f) => (PROFILES[f.profile] || PROFILES.rgb).channels.length;
  const byKey = new Map();
  for (const f of state.fixtures) if (f.rigKey) byKey.set(f.rigKey, f);

  // Occupancy of everything already on the desk except `skip`: universe(0-based):channel.
  const occupant = (universe, address, width, skip) => {
    for (const f of state.fixtures) {
      if (f === skip || f.universe !== universe) continue;
      const w = widthOf(f);
      if (address <= f.address + w - 1 && f.address <= address + width - 1) return f;
    }
    return null;
  };
  const describe = (f) => `${f.index}.${f.name} at U${f.universe + 1}.${String(f.address).padStart(3, '0')}`;

  // 1. Profiles for every (type, mode) asked for.
  const profileFor = new Map();
  for (const l of lamps) {
    const n = Number(l.footprint);
    if (!Number.isInteger(n) || n < 1 || n > 512) continue;
    const name = profileNameFor(String(l.code || l.type || 'fixture'), String(l.mode || `${n}ch`));
    if (profileFor.has(l.key)) continue;
    const existing = findProfile(name);
    if (existing) {
      if (PROFILES[existing].channels.length !== n) {
        flag(l.key, 'profile-clash', `a fixture type named "${existing}" already exists with ${PROFILES[existing].channels.length} channels, not ${n} — rename it on the desk`);
        continue;
      }
      profileFor.set(l.key, existing);
      continue;
    }
    const { roles, labels, defaults } = channelsFor({ ...l, footprint: n });
    try {
      profileFor.set(l.key, addProfile(name, roles, { cat: '_RIG', labels, defaults }));
    } catch (e) {
      flag(l.key, 'profile-refused', e.message);
    }
  }
  state.customProfiles = customProfiles();

  // `repatch: true` ("patch this group"): the listed lamps start over — their fixtures
  // come off the desk and their room addresses are ignored, so the group is laid out
  // again as one block. Their indices are kept.
  if (body.repatch) {
    for (const l of lamps) {
      const f = byKey.get(l.key);
      if (f) {
        if (l.index == null) l.index = f.index;
        state.fixtures = state.fixtures.filter((x) => x !== f);
        byKey.delete(l.key);
      }
      delete l.universe; delete l.address;
    }
  }

  const requested = new Map(lamps.map((l) => [l.key, l]));
  const isCopy = (lamp, hit) => {
    // The address it carries belongs to another lamp of the same room that says the
    // same thing — the room has two lamps claiming one address, and this one is new.
    if (!hit || !hit.rigKey || !hit.rigKey.startsWith(prefix)) return false;
    const other = requested.get(hit.rigKey);
    return !!other && other.universe === lamp.universe && other.address === lamp.address;
  };

  const nextIndex = () => engine.nextIndex();
  const indexTaken = (index, skip) => state.fixtures.some((f) => f !== skip && f.index === index);

  // Lowest universe (0-based) with `width` free channels in a row, starting at `from`.
  const lowestRoom = (width, from = 0) => {
    for (let u = from; u <= MAX_UNIVERSE; u++) {
      const a = engine.nextFreeAddress(u, width);
      if (a != null) return { universe: u, address: a };
    }
    return null;
  };

  const create = (lamp, profile, universe, address, index) => {
    const f = makeFixture({
      name: String(lamp.name || lamp.code || profile).slice(0, 48),
      profile, universe, address,
      index: index != null && !indexTaken(index) ? index : nextIndex(),
      rigKey: lamp.key,
    });
    state.fixtures.push(f);
    byKey.set(lamp.key, f);
    return f;
  };

  const report = (lamp, f, how) => assignments.push({
    key: lamp.key, index: f.index, universe: f.universe + 1, address: f.address,
    footprint: widthOf(f), profile: f.profile, how,
  });

  // 2. Lamps with no footprint: nothing may stand on the desk for them.
  const unpatchable = new Set();
  for (const l of lamps) {
    const n = Number(l.footprint);
    if (Number.isInteger(n) && n >= 1 && n <= 512 && profileFor.has(l.key)) continue;
    unpatchable.add(l.key);
    if (!flags.some((x) => x.key === l.key)) flag(l.key, 'mode-unknown', `${l.code || l.type || 'this lamp'}: no DMX mode is known, so it has no address`);
    const f = byKey.get(l.key);
    if (f) { state.fixtures = state.fixtures.filter((x) => x !== f); byKey.delete(l.key); removed.push(l.key); }
  }

  // 3. Lamps already on the desk: keep, move to a typed address, or change mode.
  const fresh = [];
  for (const l of lamps) {
    if (unpatchable.has(l.key)) continue;
    const profile = profileFor.get(l.key);
    const width = PROFILES[profile].channels.length;
    const f = byKey.get(l.key);
    if (!f) { fresh.push(l); continue; }
    const roomU = Number.isInteger(l.universe) && l.universe >= 1 ? l.universe - 1 : f.universe;
    const roomA = Number.isInteger(l.address) && l.address >= 1 ? l.address : f.address;
    // The room and the desk disagree about where this fixture is, and nobody said which
    // is meant: either the address was typed in the room (the client sends `move`) or
    // the fixture was re-patched on the desk. Flag it and change neither.
    if ((roomU !== f.universe || roomA !== f.address) && !l.move) {
      flag(l.key, 'desk-differs', `the room says U${roomU + 1}.${String(roomA).padStart(3, '0')}, this desk has ${describe(f)} — choose one`);
      report(l, f, 'differs');
      continue;
    }
    const wantU = roomU;
    const wantA = roomA;
    if (wantA + width - 1 > 512) {
      flag(l.key, 'off-the-end', `${describe(f)}: ${width} channels from ${wantA} run past 512`);
      report(l, f, 'kept');
      continue;
    }
    if (f.profile === profile && f.universe === wantU && f.address === wantA) { report(l, f, 'kept'); continue; }
    const hit = occupant(wantU, wantA, width, f);
    if (hit) {
      flag(l.key, 'overlap', `U${wantU + 1}.${String(wantA).padStart(3, '0')} (${width} ch) overlaps ${describe(hit)} — left where it was`);
      report(l, f, 'kept');
      continue;
    }
    const how = f.profile !== profile ? 'mode-changed' : 'moved';
    if (f.profile !== profile) {
      f.profile = profile;
      const own = PROFILES[profile].defaults || {};
      for (const role of PROFILES[profile].channels) if (f.values[role] == null) f.values[role] = own[role] != null ? own[role] : 0;
    }
    f.universe = wantU; f.address = wantA;
    report(l, f, how);
  }

  // 4. New lamps: typed addresses first (so they are not taken by an allocation),
  //    then copies and unaddressed lamps, one group at a time.
  const place = [];
  for (const l of fresh) {
    const profile = profileFor.get(l.key);
    const width = PROFILES[profile].channels.length;
    if (Number.isInteger(l.universe) && l.universe >= 1 && Number.isInteger(l.address) && l.address >= 1) {
      const u = l.universe - 1;
      if (l.address + width - 1 > 512) { flag(l.key, 'off-the-end', `${width} channels from ${l.address} run past 512`); continue; }
      const hit = occupant(u, l.address, width, null);
      if (!hit) { report(l, create(l, profile, u, l.address, l.index), 'created'); continue; }
      if (isCopy(l, hit)) { place.push({ lamp: l, profile, width, copy: true }); continue; }
      flag(l.key, 'overlap', `U${l.universe}.${String(l.address).padStart(3, '0')} (${width} ch) overlaps ${describe(hit)} — not patched`);
      continue;
    }
    place.push({ lamp: l, profile, width, copy: false });
  }

  if (body.group) {
    const groups = new Map();
    for (const p of place) {
      const g = String(p.lamp.group || p.lamp.key);
      if (!groups.has(g)) groups.set(g, []);
      groups.get(g).push(p);
    }
    for (const [g, members] of groups) {
      const total = members.reduce((s, p) => s + p.width, 0);
      const from = members[0].lamp.universe >= 1 ? members[0].lamp.universe - 1 : 0;
      const spot = total <= 512 ? lowestRoom(total, from) : null;
      if (!spot) {
        // A group wider than a universe, or no universe with room: each lamp on its own.
        if (total > 512) flag(members[0].lamp.key, 'group-split', `group ${g} is ${total} channels — wider than one universe, patched lamp by lamp`);
        for (const p of members) placeOne(p);
        continue;
      }
      let a = spot.address;
      for (const p of members) {
        report(p.lamp, create(p.lamp, p.profile, spot.universe, a, p.copy ? null : p.lamp.index), p.copy ? 'copy' : 'created');
        a += p.width;
      }
    }
  } else {
    for (const p of place) placeOne(p);
  }

  function placeOne(p) {
    const from = p.lamp.universe >= 1 ? p.lamp.universe - 1 : 0;
    const spot = lowestRoom(p.width, from);
    if (!spot) { flag(p.lamp.key, 'no-room', 'no universe has room'); return; }
    report(p.lamp, create(p.lamp, p.profile, spot.universe, spot.address, p.copy ? null : p.lamp.index), p.copy ? 'copy' : 'created');
  }

  // 5. Prune: this room's fixtures whose lamp is gone.
  if (body.prune) {
    const keep = new Set(lamps.map((l) => l.key));
    const gone = state.fixtures.filter((f) => f.rigKey && f.rigKey.startsWith(prefix) && !keep.has(f.rigKey));
    if (gone.length) {
      const ids = new Set(gone.map((f) => f.id));
      state.fixtures = state.fixtures.filter((f) => !ids.has(f.id));
      for (const g of state.groups) g.ids = g.ids.filter((id) => !ids.has(id));
      state.groups = state.groups.filter((g) => g.ids.length > 0);
      for (const f of gone) removed.push(f.rigKey);
    }
  }

  return { status: 200, body: { ok: true, assignments, flags, removed } };
}

// What this desk holds for a room: its rig fixtures, by key.
function rigList(ctx, project) {
  const { state, PROFILES } = ctx;
  const prefix = project ? project + ':' : '';
  return state.fixtures
    .filter((f) => f.rigKey && (!prefix || f.rigKey.startsWith(prefix)))
    .map((f) => ({
      key: f.rigKey, id: f.id, index: f.index, name: f.name, profile: f.profile,
      universe: f.universe + 1, address: f.address,
      footprint: (PROFILES[f.profile] || PROFILES.rgb).channels.length,
    }));
}

module.exports = { rigPatch, rigList, profileNameFor };
