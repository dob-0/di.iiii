'use strict';
// Reads PROVEN.md and says, per feature, whether its code moved since it was proven.
//   node proven.js            list rows: "proven, untouched" | "changed since <commit>" | "owed" (exit 0)
//   node proven.js --run      also run the gate of every changed or owed row; exit 1 if one fails
// A row's gate is the first `code` cell; its cwd is the repo root unless the cell says "(cwd dir)".

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const REPO = path.join(__dirname, '..', '..', '..', '..');
const PROVEN = path.join(__dirname, '..', 'PROVEN.md');
const COLS = ['feature', 'gate', 'look', 'proven', 'by', 'files', 'evidence'];

function parse(text) {
  const rows = [];
  for (const line of text.split('\n')) {
    if (!line.startsWith('| ') || /^\|\s*-/.test(line) || /^\|\s*feature\s*\|/.test(line)) continue;
    const cells = line.replace(/^\|\s*|\s*\|\s*$/g, '').split(/\s\|\s/).map((c) => c.trim());
    if (cells.length !== COLS.length) continue;
    const row = Object.fromEntries(COLS.map((k, i) => [k, cells[i]]));
    const m = row.proven.match(/^(\d{4}-\d{2}-\d{2})\s+([0-9a-f]{7,40})$/);
    row.date = m ? m[1] : null;
    row.commit = m ? m[2] : null;
    row.paths = row.files.split(/\s+/).filter(Boolean);
    const g = row.gate.match(/`([^`]+)`(?:\s*\(cwd\s+([^)]+)\))?/);
    row.cmd = g ? g[1] : null;
    row.cwd = g && g[2] ? g[2] : null;
    rows.push(row);
  }
  return rows;
}

// untouched | changed | owed. Unknown commit (not in this clone) counts as changed: never "proven" by default.
function status(row, git = (args) => spawnSync('git', args, { cwd: REPO, encoding: 'utf8' })) {
  if (!row.commit) return 'owed';
  const r = git(['diff', '--quiet', `${row.commit}..HEAD`, '--', ...row.paths]);
  if (r.status === 0) return 'untouched';
  return 'changed'; // 1 = differs, 128 = commit unknown
}

function main(argv) {
  const rows = parse(fs.readFileSync(PROVEN, 'utf8'));
  let failed = 0;
  for (const row of rows) {
    const st = status(row);
    const said = st === 'untouched' ? `proven, untouched since ${row.commit.slice(0, 9)} (${row.date})`
      : st === 'owed' ? 'owed: never proven' : `changed since ${row.commit.slice(0, 9)}: gate runs again, look owed again`;
    console.log(`${st === 'untouched' ? 'ok ' : '.. '} ${row.feature}: ${said}`);
    if (argv.includes('--run') && st !== 'untouched' && row.cmd) {
      const [bin, ...args] = row.cmd.split(/\s+/);
      const r = spawnSync(bin, args, { cwd: path.join(REPO, row.cwd || ''), stdio: 'inherit' });
      if (r.status !== 0) { failed++; console.log(`!! ${row.feature}: gate failed`); }
    }
  }
  return failed ? 1 : 0;
}

if (require.main === module) process.exit(main(process.argv.slice(2)));
module.exports = { parse, status, PROVEN };
