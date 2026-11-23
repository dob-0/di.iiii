'use strict';
// Where a follow goes on to: the ONE answer for both sides. cues.js steps the sequence on
// the server; cueui.js draws the Follow… editor and the "→ 3s" badges on the page. Two
// copies of this drifted once — the page read containers (`banks`) that this desk does not
// have, so it called a working follow dead and its editor could not save the default. So
// the server requires this file and the page loads it, the way objcore.js is shared.
(function (root) {
  // The id of the scene `sc` goes on to: its followId (when that scene still exists), else
  // the next live scene in its container — or, on a desk with no containers at all, the
  // next scene in the library. null = the sequence ends here. `followId` defaults to the
  // scene's own; the editor passes null to ask what the default would be.
  function followNextId(scenes, banks, sc, followId = sc && sc.followId) {
    if (!sc || !Array.isArray(scenes)) return null;
    const live = new Set(scenes.map((s) => s.id));
    if (followId) return live.has(followId) ? followId : null;
    const hasBanks = Array.isArray(banks) && banks.length > 0;
    const bank = hasBanks ? banks.find((b) => b && Array.isArray(b.sceneIds) && b.sceneIds.includes(sc.id)) : null;
    const order = hasBanks ? (bank ? bank.sceneIds : null) : scenes.map((s) => s.id);
    if (!order) return null;
    const ids = order.filter((id) => live.has(id));
    const i = ids.indexOf(sc.id);
    return i >= 0 && i + 1 < ids.length ? ids[i + 1] : null;
  }

  const api = { followNextId };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.CueCore = api;
})(typeof window !== 'undefined' ? window : this);
