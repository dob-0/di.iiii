// @vitest-environment jsdom
//
// capturePageTimers (pageTimers.mjs) stops what a jsdom page leaves running when its test file ends, and every laser desk page
// test and the Show desk page test use it. Why: these pages poll forever; the first tick after vitest removes `document` throws
// "document is not defined" with no test running, which is an unhandled error and exit 1 with every test green (stage CI
// 2026-11-01).
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { capturePageTimers } from './pageTimers.mjs'

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const realSetTimeout = globalThis.setTimeout
const wait = (ms) => new Promise((resolve) => realSetTimeout(resolve, ms))

let capture = null
let undoFrames = null
const begin = () => { capture = capturePageTimers(); return capture }
// A stand-in for the browser's frame queue that keeps what is waiting in it, so a test reads the queue instead of waiting for a
// frame to fire (when jsdom fires one is the clock's business, not something a test can assert). Put it in BEFORE begin(), so the
// helper wraps it; afterEach takes it out once stop() has put it back.
const stubFrames = () => {
    const was = { request: globalThis.requestAnimationFrame, cancel: globalThis.cancelAnimationFrame }
    const waiting = new Map()
    let last = 0
    globalThis.requestAnimationFrame = (fn) => { last += 1; waiting.set(last, fn); return last }
    globalThis.cancelAnimationFrame = (id) => { waiting.delete(id) }
    undoFrames = () => { globalThis.requestAnimationFrame = was.request; globalThis.cancelAnimationFrame = was.cancel }
    return waiting
}
// A test that fails half way must not leave the wrappers (or the stub) installed for the next one: stop() first, then the stub goes.
afterEach(async () => { await capture?.stop(); capture = null; undoFrames?.(); undoFrames = null })

describe('capturePageTimers', () => {
    it('cancels the timeouts, intervals and animation frames the page made, so none fires after stop()', async () => {
        const timers = begin()
        const fired = []
        setTimeout(() => fired.push('timeout'), 10)
        setInterval(() => fired.push('interval'), 5)
        globalThis.requestAnimationFrame(() => fired.push('frame'))
        await timers.stop()
        await wait(80)
        expect(fired).toEqual([])
    })

    it('leaves alone what was scheduled before it started (the runner\'s own timers)', async () => {
        const fired = []
        realSetTimeout(() => fired.push('early'), 10)
        const timers = begin()
        await timers.stop()
        await wait(60)
        expect(fired).toEqual(['early'])
    })

    it('puts the real timer functions back', async () => {
        const real = [globalThis.setTimeout, globalThis.setInterval, globalThis.requestAnimationFrame]
        const timers = begin()
        real.forEach((fn, i) => expect([globalThis.setTimeout, globalThis.setInterval, globalThis.requestAnimationFrame][i]).not.toBe(fn))
        await timers.stop()
        real.forEach((fn, i) => expect([globalThis.setTimeout, globalThis.setInterval, globalThis.requestAnimationFrame][i]).toBe(fn))
    })

    it('cancels a timer that a loop re-arms after stop() has begun (an await still in flight)', async () => {
        const timers = begin()
        let runs = 0
        const loop = async () => { runs += 1; await Promise.resolve(); setTimeout(loop, 5) } // desk.js: await fn(), then setTimeout(run, ms)
        loop()
        await timers.stop()
        await wait(80)
        expect(runs).toBe(1)
    })

    it('a frame that is pending at stop() is cancelled, so the calm tick (timeout, frame, timeout) cannot restart', async () => {
        const waiting = stubFrames() // the frame queue, read here instead of waited for
        const timers = begin()
        const tick = () => setTimeout(() => globalThis.requestAnimationFrame(tick), 5) // desk.js playTiles in calm motion
        globalThis.requestAnimationFrame(tick)
        expect(waiting.size).toBe(1) // the page's frame is waiting in the queue (it got there through the wrapper)
        await timers.stop()
        expect(waiting.size).toBe(0) // stop() took it out: no frame is left to fire into a document that is gone
    })

    it('stop() twice is harmless: the second one puts nothing back again', async () => {
        const timers = begin()
        await timers.stop()
        const kept = globalThis.setTimeout
        const mine = () => {}
        globalThis.setTimeout = mine
        try {
            await timers.stop()
            expect(globalThis.setTimeout).toBe(mine)
        } finally {
            globalThis.setTimeout = kept
        }
    })
})

// Which file is hit depends on timing (8 to 13 errors per CI job, a different file each run), so the fix cannot be left to
// each author to remember: a page test that boots the page without the helper fails here, before CI does. Two families boot a
// page that never stops: the laser desk (laser/ui/desk.js) and the Show desk (showDesk/ui/show.js, which re-arms its poll and
// preview timers). A page test in another directory is not seen: name the directory in PAGE_TEST_DIRS when a page gets tests.
const PAGE_TEST_DIRS = [['laser', 'ui'], ['showDesk']]
const testFilesIn = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) return entry.name === 'node_modules' ? [] : testFilesIn(full)
    return entry.name.endsWith('.test.js') ? [full] : []
})
// What is wrong with one page test, in words. The capture must be a module-level statement (it starts the line): that runs when
// the file is collected, before any hook or test can boot the page, wherever the statement sits in the text. A capture inside a
// hook may come after the boot, so it does not count.
const problemsOf = ({ name, text }) => {
    const capturing = text.match(/^(?:const|let)\s+(\w+)\s*=\s*capturePageTimers\(\)/m)
    if (!capturing) return [`${name}: no module-level "const pageTimers = capturePageTimers()"`]
    return new RegExp(`\\b${capturing[1]}\\.stop\\(\\)`).test(text) ? [] : [`${name}: ${capturing[1]}.stop() is never called (await it in afterAll)`]
}

describe('every laser desk and Show desk page test stops the page timers', () => {
    const pageTests = PAGE_TEST_DIRS
        .flatMap((parts) => testFilesIn(path.join(SRC, ...parts)))
        .map((file) => ({ name: path.relative(SRC, file).split(path.sep).join('/'), text: fs.readFileSync(file, 'utf8') }))
        .filter(({ text }) => text.includes('new Function(')) // runs the page's own source in the test's document

    it('finds the page tests it guards (seven today: six laser desk, one Show desk)', () => {
        const names = pageTests.map(({ name }) => name)
        expect(names.filter((n) => n.startsWith('laser/ui/')).length).toBeGreaterThanOrEqual(6)
        expect(names.filter((n) => n.startsWith('showDesk/')).length).toBeGreaterThanOrEqual(1)
    })

    it('each captures the timers at module level, before any hook boots the page, and stops them', () => {
        const problems = pageTests.flatMap(problemsOf)
        expect(problems, 'const pageTimers = capturePageTimers() at module level, await pageTimers.stop() in afterAll (testSupport/pageTimers.mjs)').toEqual([])
    })

    it('names a page test that does not capture, captures inside a hook, or never stops (the guard itself goes red)', () => {
        const boot = 'beforeAll(() => { new Function(src)() })'
        const stop = 'afterAll(async () => { await pageTimers.stop() })'
        const wired = `const pageTimers = capturePageTimers()\n${boot}\n${stop}`
        const wiredBelow = `${boot}\nconst pageTimers = capturePageTimers()\n${stop}` // as desk.test.js is laid out: still runs at collection
        const bare = boot
        const inHook = `beforeAll(() => {\n    new Function(src)()\n    const pageTimers = capturePageTimers()\n})\n${stop}`
        const unstopped = `const pageTimers = capturePageTimers()\n${boot}`
        expect(problemsOf({ name: 'wired', text: wired })).toEqual([])
        expect(problemsOf({ name: 'wiredBelow', text: wiredBelow })).toEqual([])
        expect(problemsOf({ name: 'bare', text: bare })).toEqual(['bare: no module-level "const pageTimers = capturePageTimers()"'])
        expect(problemsOf({ name: 'inHook', text: inHook })).toEqual(['inHook: no module-level "const pageTimers = capturePageTimers()"'])
        expect(problemsOf({ name: 'unstopped', text: unstopped })).toEqual(['unstopped: pageTimers.stop() is never called (await it in afterAll)'])
    })
})
