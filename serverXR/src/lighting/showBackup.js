'use strict';
// A dated copy of a show file, kept beside it in backups/ (newest 20). Taken before anything that
// replaces a show — leaving it for another, a reset — so a wipe is one copy away from undone
// (installed desk, 2026-10-21: it held the MOXIR show and was due a reset). Also the operator's
// command before a manual reset:  node tools/backup-show.js <data dir or show.json> [reason]
// Returns the new path, or null when there is no saved show to copy.

const fs = require('fs');
const path = require('path');

const KEEP = 20;

function backupShowFile(file, reason, now = new Date()) {
  if (!fs.existsSync(file)) return null;
  const dir = path.join(path.dirname(file), 'backups');
  fs.mkdirSync(dir, { recursive: true });
  const tag = String(reason || 'manual').replace(/[^a-z0-9-]/gi, '-').slice(0, 24);
  const to = path.join(dir, `show-${now.toISOString().replace(/[:.]/g, '-')}-${tag}.json`);
  fs.copyFileSync(file, to);
  const all = fs.readdirSync(dir).filter((f) => /^show-.*\.json$/.test(f)).sort();
  for (const f of all.slice(0, Math.max(0, all.length - KEEP))) {
    try { fs.unlinkSync(path.join(dir, f)); } catch (e) { /* an old copy that stays is not worth failing a save */ }
  }
  return to;
}

module.exports = { backupShowFile, KEEP };
