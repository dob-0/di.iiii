// How the Monitor judges a probe over time. One slow answer or one refusal is not an outage:
// a probe is DOWN only after two checks in a row failed (each check already includes one quick
// re-try), a slow answer is "slow (N ms)" and still up, and the time of the last good answer is
// kept so the page can say "last answered 40 s ago" instead of flipping.
//
// state: 'up' | 'slow' | 'doubt' (one miss, last good answer still held) | 'down'

const SLOW_MS = 1500
const MISSES_TO_DOWN = 2
const RETRY_WAIT_MS = 250

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * attempt() -> { ok, status, ms, ...rest }. A failed attempt is tried once more after a short
 * wait; the check is the retry's answer when that one is good, otherwise the first failure.
 */
async function checkWithRetry(attempt, { retryWait = RETRY_WAIT_MS } = {}) {
  const first = await attempt()
  if (first.ok) return first
  await wait(retryWait)
  const second = await attempt()
  return second.ok ? second : first
}

function createProbeTracker({ slowMs = SLOW_MS, missesToDown = MISSES_TO_DOWN, now = () => Date.now() } = {}) {
  const seen = new Map()

  /** result: { ok, status, ms } of one finished check. Returns the judged fields for the row. */
  function judge(id, result) {
    const before = seen.get(id) || { misses: 0, lastGoodAt: null, lastGoodStatus: null }
    let next
    if (result.ok) {
      next = { misses: 0, lastGoodAt: now(), lastGoodStatus: result.status }
    } else {
      next = { ...before, misses: before.misses + 1 }
    }
    seen.set(id, next)
    const holding = !result.ok && next.misses < missesToDown && next.lastGoodAt !== null
    const state = result.ok ? (result.ms > slowMs ? 'slow' : 'up') : (holding ? 'doubt' : 'down')
    return {
      state,
      ok: state !== 'down',
      status: holding ? next.lastGoodStatus : result.status,
      rawStatus: result.status,
      misses: next.misses,
      lastGoodAt: next.lastGoodAt ? new Date(next.lastGoodAt).toISOString() : null,
      note: state === 'slow' ? `slow (${result.ms} ms)` : state === 'doubt' ? 'one check missed, last good answer kept' : null
    }
  }

  return { judge }
}

module.exports = { SLOW_MS, MISSES_TO_DOWN, checkWithRetry, createProbeTracker }
