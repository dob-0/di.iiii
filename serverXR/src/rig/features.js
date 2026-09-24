// Rig features — everything beyond the frozen core of protocol 1 is a feature
// with its own integer version (docs/architecture/rig/PROTOCOL-1.md §3).
//
// Two members never compare releases. On hello each side takes the minimum of
// what both declare, per name, and code asks `agreed[name] >= n`. That is the
// whole mechanism that lets a 0.9 member keep working with a 0.5 one: the newer
// side simply doesn't use what the older side never said it had.

// Step 1's table. ADD names here; never rename one, never lower a version
// that has shipped.
const LOCAL_FEATURES = Object.freeze({ card: 1, cue: 1, blackout: 1, members: 1, discovery: 1 })

// A usable feature version is a positive integer. Anything else — "2", 1.5, 0,
// -1, null — is what a confused or hostile peer sends, and treating it as
// "absent" is the tolerant reading (§4 rule 2): never an error, never a guess.
const isVersion = (value) => Number.isInteger(value) && value > 0

const isTable = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value)

function agree(a, b) {
  const agreed = {}
  if (!isTable(a) || !isTable(b)) return agreed
  for (const name of Object.keys(a)) {
    // own-property only: a peer's `__proto__` key must not reach the prototype.
    if (!Object.prototype.hasOwnProperty.call(b, name)) continue
    if (!isVersion(a[name]) || !isVersion(b[name])) continue
    agreed[name] = Math.min(a[name], b[name])
  }
  return agreed
}

module.exports = { LOCAL_FEATURES, agree, isVersion }
