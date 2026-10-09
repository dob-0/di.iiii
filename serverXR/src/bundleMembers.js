// What a .diiii may hold: regular files and directories, nothing else.
//
// One helper for both readers of the format: scripts/space-bundle.mjs (import,
// loaded from the server's source the way it loads db.js) and
// contentProposals.js (a file proposed for a space that already exists).
// The method is the usual one for unpacking an untrusted archive
// (OWASP ASVS 4.0.3 V12.3.1 / V12.3.2: names and paths from outside stay inside
// the intended directory):
//
//   1. before anything is written, the archive's own listing (`tar -tvzf`):
//      every member must be a regular file (`-`) or a directory (`d`) — the
//      mode column names a symlink `l`, hard link `h`, device, fifo or socket
//      the same way in GNU tar and bsdtar, and a hard link is also printed as
//      "link to";
//   2. after extraction, lstat over everything that landed — this does not
//      depend on how a tar prints, and a hard link shows as nlink > 1;
//   3. at every read, the real path of what is opened must lie inside the real
//      path of the directory it was unpacked into.
//
// CommonJS, no dependencies beyond node: — the server image ships src/ only.

const fsp = require('node:fs/promises')
const path = require('node:path')

const kindName = (kind) => (kind === 'l' ? 'symbolic link' : kind === 'h' ? 'hard link' : 'special file')

// `tar -tvzf` output → the first member that is not a regular file or a
// directory, as { kind, line }, or null when every member is one of the two.
const findNonRegularMember = (listing) => {
  for (const raw of String(listing).split('\n')) {
    const line = raw.trim()
    if (!line) continue
    const kind = line[0]
    if (kind !== '-' && kind !== 'd') return { kind: kindName(kind), line }
    if (/ link to /.test(line)) return { kind: 'hard link', line }
  }
  return null
}

// lstat over everything under root → the first entry that is not a directory
// or a regular file with one link, as { kind, path (relative) }, or null.
const findNonRegularEntry = async (root) => {
  const pending = [root]
  while (pending.length) {
    const dir = pending.pop()
    for (const entry of await fsp.readdir(dir)) {
      const full = path.join(dir, entry)
      const st = await fsp.lstat(full)
      if (st.isDirectory()) { pending.push(full); continue }
      if (!st.isFile()) return { kind: st.isSymbolicLink() ? 'symbolic link' : 'special file', path: path.relative(root, full) }
      if (st.nlink > 1) return { kind: 'hard link', path: path.relative(root, full) }
    }
  }
  return null
}

// True when target's real path is root's real path or below it. A path that
// does not exist is not inside anything.
const isInsideRoot = async (root, target) => {
  try {
    const realRoot = await fsp.realpath(root)
    const realTarget = await fsp.realpath(target)
    const rel = path.relative(realRoot, realTarget)
    return rel === '' || (rel !== '..' && !rel.startsWith(`..${path.sep}`) && !path.isAbsolute(rel))
  } catch {
    return false
  }
}

// A regular file, not a link, whose real path lies inside root.
const isRegularFileInside = async (root, file) => {
  try {
    if (!(await fsp.lstat(file)).isFile()) return false
  } catch {
    return false
  }
  return isInsideRoot(root, file)
}

module.exports = {
  findNonRegularMember,
  findNonRegularEntry,
  isInsideRoot,
  isRegularFileInside
}
