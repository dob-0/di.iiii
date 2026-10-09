'use strict'

// Orderly stop on SIGTERM / SIGINT (what `docker stop`, systemd and Ctrl-C send).
// Order: stop accepting, stop the timers, checkpoint the write-ahead log into the
// main file and close the database (https://sqlite.org/wal.html#ckpt), exit 0.
// A hard deadline exits non-zero and says why, so a hung stop is never silent.
// Node documents that a process with a signal handler gets the signal even as
// PID 1 (https://nodejs.org/api/process.html#signal-events).

function createShutdown({
  server,
  timers = [],
  checkpoint = () => {},
  closeDb = () => {},
  exit = (code) => process.exit(code),
  logger = console,
  hardTimeoutMs = 10000,
  drainMs = 3000
}) {
  let started = false
  const run = (signal) => {
    if (started) return
    started = true
    logger.info(`[shutdown] ${signal}: stopping`)
    const hard = setTimeout(() => {
      logger.error(`[shutdown] still running ${hardTimeoutMs} ms after ${signal}; exiting 1`)
      exit(1)
    }, hardTimeoutMs)
    hard.unref?.()
    for (const t of timers) clearInterval(t)
    let finished = false
    const finish = () => {
      if (finished) return
      finished = true
      let code = 0
      try { checkpoint() } catch (error) { code = 1; logger.error(`[shutdown] checkpoint failed: ${error?.message || error}`) }
      try { closeDb() } catch (error) { code = 1; logger.error(`[shutdown] database close failed: ${error?.message || error}`) }
      clearTimeout(hard)
      logger.info(`[shutdown] done, exit ${code}`)
      exit(code)
    }
    // Upgraded (websocket) sockets are not tracked by the http server, so close()
    // may never call back; after drainMs the database is closed regardless.
    const drain = setTimeout(() => {
      logger.warn(`[shutdown] connections still open after ${drainMs} ms; closing the database anyway`)
      finish()
    }, drainMs)
    drain.unref?.()
    try {
      server.close(() => { clearTimeout(drain); finish() })
      server.closeIdleConnections?.()
      setTimeout(() => server.closeAllConnections?.(), 1000).unref?.()
    } catch (error) {
      logger.warn(`[shutdown] server.close: ${error?.message || error}`)
      clearTimeout(drain)
      finish()
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

module.exports = { createShutdown, installShutdown }
