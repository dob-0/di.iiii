'use strict';
// Back up a show before anything resets it:  node backup-show.js <data dir | show.json> [reason]
// Read-only on the show; writes one copy into backups/ beside it. No desk needs to be running.
const fs = require('fs');
const path = require('path');
const { backupShowFile } = require('../showBackup');

const arg = process.argv[2];
if (!arg) { console.error('usage: node backup-show.js <data dir | show.json> [reason]'); process.exit(2); }
const file = fs.existsSync(arg) && fs.statSync(arg).isDirectory() ? path.join(arg, 'show.json') : arg;
const to = backupShowFile(file, process.argv[3] || 'manual');
if (!to) { console.error(`no show at ${file}; nothing to back up`); process.exit(1); }
console.log(`backed up ${file} -> ${to}`);
