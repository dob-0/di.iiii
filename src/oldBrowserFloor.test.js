import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const html = readFileSync(path.join(ROOT, 'src/index.html'), 'utf8')

// The shim, taken out of the document rather than retyped — a copy in the test
// would keep passing after somebody deleted the real one.
const shim = (() => {
    const match = html.match(/<script>([\s\S]*?)<\/script>/)
    return match ? match[1] : ''
})()

describe('the old-browser floor', () => {
    it('the document carries an Iterator shim, before the module', () => {
        expect(shim).toContain("typeof Iterator")
        const shimAt = html.indexOf('<script>')
        const moduleAt = html.indexOf('type="module"')
        expect(shimAt).toBeGreaterThan(-1)
        expect(moduleAt).toBeGreaterThan(shimAt)
    })

    // The actual failure, reproduced: pdf.js's own polyfill line, run in a realm
    // with no `Iterator` global. Without the shim it throws exactly the
    // ReferenceError that painted every page of the site black on Chrome 113.
    it('lets pdf.js patch Iterator.prototype where the global does not exist', () => {
        const pdfjsLine = "typeof Iterator.prototype.join !== 'function' && (Iterator.prototype.join = function (sep) { return [...this].join(sep) })"

        // This Node has `Iterator`; the browsers in question do not. Take it
        // away, or the test asserts nothing about them.
        const olderBrowser = () => {
            const context = vm.createContext({})
            vm.runInContext('delete globalThis.Iterator', context)
            return context
        }

        const bare = olderBrowser()
        expect(() => vm.runInContext(pdfjsLine, bare)).toThrow(/Iterator is not defined/)

        const shimmed = olderBrowser()
        vm.runInContext(shim, shimmed)
        expect(() => vm.runInContext(pdfjsLine, shimmed)).not.toThrow()

        // And the thing it patched is the real %IteratorPrototype%, so the
        // method lands where an iterator will actually find it.
        const reachable = vm.runInContext(
            "Object.getPrototypeOf(Object.getPrototypeOf([][Symbol.iterator]())).join === Iterator.prototype.join",
            shimmed
        )
        expect(reachable).toBe(true)
    })

    it('leaves a modern browser alone', () => {
        const modern = vm.createContext({})
        vm.runInContext("globalThis.Iterator = function RealIterator() {}", modern)
        vm.runInContext(shim, modern)
        expect(vm.runInContext('Iterator.name', modern)).toBe('RealIterator')
    })
})
