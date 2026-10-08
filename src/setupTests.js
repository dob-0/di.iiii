import '@testing-library/jest-dom/vitest'
import { configure } from '@testing-library/react'

// Testing Library's async utils (findBy*, waitFor) default to a 1000ms budget.
// That is not a budget for the app's behavior -- it is a budget for how long
// this machine takes to run a few render passes, and under load (a parallel
// suite, a busy CI box) it runs out before anything is actually wrong. Two
// real examples, both reproduced by running two full suites concurrently:
// PublicProjectViewer's walk-mode exit button resolved at 1405ms, and
// SpaceHub's queued preview boot needs two state settles. Neither is a slow
// test -- they are correct tests losing a race with the scheduler.
//
// 5s is still far below the per-test timeout, so a genuinely stuck query
// fails the test with the same "unable to find" message, only later.
configure({ asyncUtilTimeout: 5000 })

// jsdom has no WebGL: getContext() returns null. GuardedCanvas probes for a
// context before mounting a <Canvas>, so tests that mock R3F's Canvas would all
// land on the "3D isn't available" card. Give GuardedCanvas's own probe canvas (marked data-di-webgl-probe) a stand-in context, and nothing else — other tests rely on a null context; a
// test of the no-WebGL path overrides this with its own spy.
if (typeof HTMLCanvasElement !== 'undefined') {
    const originalGetContext = HTMLCanvasElement.prototype.getContext
    HTMLCanvasElement.prototype.getContext = function getContext(type, ...rest) {
        if (this.dataset?.diWebglProbe && (type === 'webgl2' || type === 'webgl')) return { getExtension: () => null }
        return originalGetContext.call(this, type, ...rest)
    }
}
