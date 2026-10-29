// A test-only rendezvous: N requests that carry the same `X-Test-Barrier: <name>:<N>`
// header wait here until all N have arrived, then all go on together. It lets a
// contract test PROVE that two requests overlap (both past their gates before
// either reaches the code under test) instead of sending them "at once" and hoping
// the scheduler interleaves them. Under CPU load the second fetch can start after
// the first has finished; this removes that dependence on timing.
//
// Inert unless NODE_ENV is exactly "test" (checked on every call): a production or
// dev server ignores the header. A request whose partners never arrive is not left
// hanging and not let through: after `timeoutMs` it fails with an error that says so.
const HEADER = 'x-test-barrier'

const createTestBarrier = ({ env = process.env, timeoutMs = 15000 } = {}) => {
  const open = new Map()
  const arrive = (req) => {
    if (String(env.NODE_ENV || '') !== 'test') return Promise.resolve()
    const raw = req?.headers?.[HEADER]
    if (!raw) return Promise.resolve()
    const match = /^([\w.-]{1,80}):(\d{1,2})$/.exec(String(raw))
    if (!match) return Promise.reject(new Error(`bad ${HEADER} header "${raw}" (want name:count)`))
    const [, name, countText] = match
    const need = Number(countText)
    let entry = open.get(name)
    if (!entry) {
      entry = { need, waiting: [] }
      open.set(name, entry)
    }
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        if (open.get(name) === entry) open.delete(name)
        reject(new Error(`test barrier "${name}": ${entry.waiting.length} of ${need} requests arrived within ${timeoutMs} ms`))
      }, timeoutMs)
      entry.waiting.push(() => { clearTimeout(timer); resolve() })
      if (entry.waiting.length >= entry.need) {
        open.delete(name)
        for (const release of entry.waiting) release()
      }
    })
  }
  return { arrive, HEADER }
}

module.exports = { createTestBarrier, TEST_BARRIER_HEADER: HEADER }
