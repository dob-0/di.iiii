// close-on-signal.cjs: a test-browser script killed by `timeout` closes its page before it exits (2026-10-09: two orphaned
// MOXIR tabs kept the CPU package at 98-100 C).
import { describe, it, expect } from 'vitest'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { closeOnSignal } = require('./close-on-signal.cjs')

describe('closeOnSignal', () => {
    it('closes the page, then exits with 128 + the signal number', async () => {
        const order = []
        const page = { close: async () => { order.push('close') } }
        const exited = new Promise((resolve) => {
            const off = closeOnSignal(() => page, { exit: (code) => { order.push(code); off(); resolve() } })
            process.emit('SIGTERM')
        })
        await exited
        expect(order).toEqual(['close', 143])
    })
    it('still exits when no page was opened yet or close hangs', async () => {
        const codes = []
        await new Promise((resolve) => {
            const off = closeOnSignal(() => ({ close: () => new Promise(() => {}) }), { timeoutMs: 20, exit: (c) => { codes.push(c); off(); resolve() } })
            process.emit('SIGINT')
        })
        await new Promise((resolve) => {
            const off = closeOnSignal(() => null, { exit: (c) => { codes.push(c); off(); resolve() } })
            process.emit('SIGTERM')
        })
        expect(codes).toEqual([130, 143])
    })
})
