// Per-key async mutex. The check-then-write sequences in spaceRoutes.js and
// projectRoutes.js (read version, compute next ops, write document, append
// ops, bump meta) span multiple awaits with no database transaction covering
// the whole thing (the document lives in a JSON file, not SQLite) — two
// concurrent requests for the same space/project can both pass the version
// check and both write, silently clobbering one another. Serializing by key
// closes that race without blocking unrelated spaces/projects from each other.
// Same pattern inscriptionRoutes.js already used for its own scene write path.
function createKeyedLock() {
  const locks = new Map()
  return function withLock(key, fn) {
    const prev = locks.get(key) || Promise.resolve()
    const run = prev.then(fn, fn)
    locks.set(key, run.then(() => {}, () => {}))
    return run
  }
}

module.exports = { createKeyedLock }
