'use strict'

// Orderly stop on SIGTERM / SIGINT (what `docker stop`, systemd and Ctrl-C send).
// Order: stop accepting, stop the timers, checkpoint the write-ahead log into the
// main file and close the database (https://sqlite.org/wal.html#ckpt), exit 0.
// A hard deadline exits non-zero and says why, so a hung stop is never silent.
// Node documents that a process with a signal handler gets the signal even as
// PID 1 (https://nodejs.org/api/process.html#signal-events).

// Requests being served right now. Counted on entry, released once on the response's
// 'finish' or 'close' (whichever comes first). A destroyed socket does not stop its
// handler, so the count — not the socket — says when the database is safe to close.
function createInflight() {
  let n = 0
  return {
    count: () => n,
    middleware: (req, res, next) => {
      n++
      let released = false
      const release = () => { if (!released) { released = true; n-- } }
      res.once('finish', release)
      res.once('close', release)
      next()
    }
  }
}

function createShutdown({
  server,
  inflight = { count: () => 0 },
  timers = [],
  checkpoint = () => {},
  closeDb = () => {},
  exit = (code) => process.exit(code),
  logger = console,
  hardTimeoutMs = 10000,
  drainMs = 3000,
  pollMs = 50
}) {
  let started = false
  const run = (signal) => {
    if (started) return
    started = true
    logger.info(`[shutdown] ${signal}: stopping`)
    const hard = setTimeout(() => {
      logger.error(`[shutdown] still running ${hardTimeoutMs} ms after ${signal}, ${inflight.count()} request(s) in flight; exiting 1`)
      exit(1)
    }, hardTimeoutMs)
    hard.unref?.()
    // Last resort, just before the deadline: cut sockets that are still busy.
    const cut = setTimeout(() => server.closeAllConnections?.(), Math.max(0, hardTimeoutMs - 500))
    cut.unref?.()
    for (const t of timers) clearInterval(t)
    let finished = false
    let closed = false
    const startedAt = Date.now()
    const finish = () => {
      if (finished) return
      finished = true
      clearInterval(poll)
      clearTimeout(cut)
      let code = 0
      try { checkpoint() } catch (error) { code = 1; logger.error(`[shutdown] checkpoint failed: ${error?.message || error}`) }
      try { closeDb() } catch (error) { code = 1; logger.error(`[shutdown] database close failed: ${error?.message || error}`) }
      clearTimeout(hard)
      logger.info(`[shutdown] done, exit ${code}`)
      exit(code)
    }
    // The database closes only when no request is in flight. Upgraded (websocket)
    // sockets are not tracked by the http server, so close() may never call back:
    // after drainMs the wait for it ends, the wait for in-flight work does not.
    const poll = setInterval(() => {
      server.closeIdleConnections?.()
      if (inflight.count() > 0) return
      if (closed || Date.now() - startedAt >= drainMs) {
        if (!closed) logger.warn(`[shutdown] connections still open after ${drainMs} ms; closing the database anyway`)
        finish()
      }
    }, pollMs)
    try {
      server.close(() => { closed = true })
      server.closeIdleConnections?.()
    } catch (error) {
      logger.warn(`[shutdown] server.close: ${error?.message || error}`)
      closed = true
    }
  }
  return run
}

function installShutdown(options) {
  const run = createShutdown(options)
  process.once('SIGTERM', () => run('SIGTERM'))
  process.once('SIGINT', () => run('SIGINT'))
  return run
}

module.exports = { createShutdown, installShutdown, createInflight }
