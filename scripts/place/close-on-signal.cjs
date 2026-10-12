/*
 * close-on-signal.cjs — a test-browser script killed by `timeout` (SIGTERM) or Ctrl-C (SIGINT) never reaches its `finally`:
 * the tab it opened stays in the shared test browser and keeps drawing the room on the GPU and the CPU. Seen 2026-10-09 (MOXIR
 * v2 spread): two such tabs held the package near 98-100 C for half an hour. closeOnSignal(getPage) closes the page first,
 * then exits with the signal's code (128 + n). GNU `timeout` (without --foreground) signals the whole process group, so the
 * node under `di-test-browser run` gets SIGTERM itself. A closed output pipe (`| tail` gone) is treated the same way (EPIPE).
 * Use it in every script that opens a page under `di-test-browser run`.
 */
const SIGNALS = { SIGTERM: 15, SIGINT: 2, SIGHUP: 1 }

const closeOnSignal = (getPage, { exit = (code) => process.exit(code), timeoutMs = 3000 } = {}) => {
    const handlers = {}
    for (const [sig, n] of Object.entries(SIGNALS)) {
        handlers[sig] = async () => {
            const page = getPage()
            const done = page ? page.close().catch(() => {}) : Promise.resolve()
            await Promise.race([done, new Promise((r) => setTimeout(r, timeoutMs))])
            exit(128 + n)
        }
        process.once(sig, handlers[sig])
    }
    const onPipe = (err) => { if (err && err.code === 'EPIPE') handlers.SIGTERM() }
    process.stdout.on('error', onPipe)
    return () => {
        for (const [sig, h] of Object.entries(handlers)) process.removeListener(sig, h)
        process.stdout.removeListener('error', onPipe)
    }
}

module.exports = { closeOnSignal, SIGNALS }
