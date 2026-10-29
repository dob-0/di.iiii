import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

// Phone Studio: the "Deleted … / Undo" notice sat 16 px under the bottom bar
// (UX fix S02, measured Undo y 770-814, bar top 798 at 390x844). One shared
// offset, --di-bottom-offset, is read by the notice and the question box.
const here = dirname(fileURLToPath(import.meta.url))
const ui = readFileSync(resolve(here, 'ui.css'), 'utf8')
const mobile = readFileSync(resolve(here, '../../studio/styles/studio-mobile.css'), 'utf8')
const rule = (source, selector) => {
    const at = source.indexOf(`${selector} {`)
    return at < 0 ? '' : source.slice(at, source.indexOf('}', at))
}

describe('the bottom offset shared by notices and questions', () => {
    it('defaults to the safe area and is raised by the Studio bottom bar', () => {
        expect(rule(ui, ':root')).toMatch(/--di-bottom-offset:\s*env\(safe-area-inset-bottom\)/)
        expect(rule(mobile, '.has-studio-bottom-bar')).toMatch(/--di-bottom-offset:\s*calc\(48px \+ env\(safe-area-inset-bottom\)\)/)
    })

    it('the bar is at least as tall as the offset it announces', () => {
        expect(rule(mobile, '.smb-nav')).toMatch(/min-height:\s*calc\(48px \+ env\(safe-area-inset-bottom\)\)/)
    })

    it('the Undo notice sits above the offset', () => {
        expect(rule(ui, '.di-undo-notice')).toMatch(/bottom:\s*calc\([^;]*var\(--di-bottom-offset\)/)
    })

    it('the question box keeps clear of the offset on a phone', () => {
        const phone = ui.slice(ui.indexOf('@media (max-width: 600px)'))
        expect(rule(phone, '.di-ask-backdrop')).toMatch(/var\(--di-bottom-offset\)/)
    })
})
