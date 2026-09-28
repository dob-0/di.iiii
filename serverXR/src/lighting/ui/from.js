'use strict';
// Which project opened the desk, and the way back to it.
//
// Light used to forget who sent you. Its one door went to /spaces, so a person who came
// from a project's Studio, Nodes or Projection had to find that project again from the
// top of the site (the stranger's walk, 2026-09-22: "show forgotten, no way back").
//
// Whoever opens the desk from a project says so in the address:
//   /light/?space=<id>&project=<id>[&label=<the project's title>]
// The desk reads that ONCE and keeps it for this tab in sessionStorage, so its own page
// switches (Setup / Control / Touch / Fader / MIDI), a reload, or an address that lost
// its query still know the way back. A bare /light/ in a fresh tab has nothing kept and
// stays exactly as it was: one door, to /spaces. The door to /spaces never changes.
//
// The three addresses MIRROR the app's own path builders, with the app at the root —
//   buildStudioProjectPath (src/studio/utils/studioRouting.js)
//   buildRawProjectPath    (src/raw/utils/rawRouting.js)
//   buildMapPath           (src/map/mapRouting.js)
// This page is plain script and cannot import them, so src/map/lightingLink.test.js
// requires this file and holds it to the real builders: if either side moves, it fails.

(function (root) {
  // An id as the app makes them (spaceStore's SLUG_REGEX and projectStore's
  // PROJECT_ID_REGEX are both [a-z0-9-]), a little wider so an older id still works —
  // and never a dot, slash, backslash or colon, so nothing typed into the query string
  // can turn the way back into a link to somewhere else.
  const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;
  const KEY = 'di.light.from';
  const LABEL_MAX = 60;
  // The rig's steps (src/rigbuild/rigTools.js RIG_STEPS: key = the address segment, and
  // its words). Opened from one of them the desk says &from=<key>, and its way back
  // leads to THAT page — the patch sheet, the cards — not to the Studio. A closed list:
  // anything else is ignored and the way back is the Studio's, as before.
  const RIG_STEPS = {
    equipment: 'equipment',
    build: 'build',
    plot: 'plot',
    cards: 'cards & looks',
    patch: 'patch sheet',
    crew: 'crew link',
    visualise: 'visualiser',
  };

  function clean(from) {
    if (!from || typeof from !== 'object') return null;
    const space = String(from.space == null ? '' : from.space);
    const project = String(from.project == null ? '' : from.project);
    if (!SAFE_ID.test(space) || !SAFE_ID.test(project)) return null;
    const label = String(from.label == null ? '' : from.label).replace(/\s+/g, ' ').trim().slice(0, LABEL_MAX);
    const step = Object.prototype.hasOwnProperty.call(RIG_STEPS, from.from) ? from.from : null;
    const out = { space, project, label: label || project };
    if (step) out.from = step;
    return out;
  }

  // undefined: the address says nothing about a project. null: it tried, and the ids
  // are not ids. Otherwise the cleaned { space, project, label[, from] }.
  function fromQuery(search) {
    const q = new URLSearchParams(search || '');
    if (!q.has('space') && !q.has('project')) return undefined;
    return clean({ space: q.get('space'), project: q.get('project'), label: q.get('label'), from: q.get('from') });
  }

  // The address wins and is kept. No address → what this tab kept. An address that
  // names something unusable clears what was kept: the person came from somewhere
  // else now, and an old way back would be a wrong one.
  function readFrom(search, storage) {
    const given = fromQuery(search);
    if (given !== undefined) {
      try {
        if (given) storage.setItem(KEY, JSON.stringify(given));
        else storage.removeItem(KEY);
      } catch (e) { /* private mode, or storage refused: the address still works */ }
      return given;
    }
    try { return clean(JSON.parse(storage.getItem(KEY) || 'null')); } catch (e) { return null; }
  }

  function projectLinks(from) {
    const f = clean(from);
    if (!f) return null;
    const links = {
      studio: '/' + f.space + '/studio/projects/' + f.project,
      nodes: '/' + f.space + '/raw/projects/' + f.project,
      projection: '/' + f.space + '/map/' + f.project,
      // The desk beside the room it drives (src/rigbuild/visualiseRouting.js).
      visualise: '/' + f.space + '/visualise/' + f.project,
    };
    // Came from a rig page: the way back is that page (mirrors the rig's path builders).
    if (f.from) {
      links.rig = '/' + f.space + '/' + f.from + '/' + f.project;
      links.rigLabel = RIG_STEPS[f.from];
    }
    return links;
  }

  const api = { KEY, RIG_STEPS, clean, fromQuery, readFrom, projectLinks };
  if (typeof module === 'object' && module && module.exports) module.exports = api;
  else root.deskFrom = api;
})(typeof window !== 'undefined' ? window : this);
