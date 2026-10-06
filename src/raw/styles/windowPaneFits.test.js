import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// NOPA audit F5 (2026-10-02): the List window's scroll pane ran 24–32px past
// the window body, whose overflow is hidden, so the last row was cut off
// however far you scrolled. Cause: `.raw-window-stack` is `height: 100%` with
// padding, and this sheet sets box-sizing per rule — content-box made the pane
// 100% PLUS its padding. Every rule that fills the body this way must count
// its padding inside the height.
const css = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'raw.css'), 'utf8')

const rulesFor = (selector) => {
    const out = []
    const re = /([^{}]+)\{([^{}]*)\}/g
    let match
    while ((match = re.exec(css))) {
        const selectors = match[1].split(',').map((part) => part.trim())
        if (selectors.includes(selector)) out.push(match[2])
    }
    return out
}

describe('a pane that fills a window body stays inside it', () => {
    it('.raw-window-stack (height 100% with padding) is border-box', () => {
        const rules = rulesFor('.raw-window-stack')
        expect(rules.some((body) => /height:\s*100%/.test(body))).toBe(true)
        expect(rules.some((body) => /box-sizing:\s*border-box/.test(body))).toBe(true)
    })
})
