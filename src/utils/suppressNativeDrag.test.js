import { describe, it, expect, afterEach } from 'vitest'
import { suppressNativeDrag } from './suppressNativeDrag.js'

function fireDragStart(el) {
    const event = new Event('dragstart', { bubbles: true, cancelable: true })
    el.dispatchEvent(event)
    return event
}

describe('suppressNativeDrag', () => {
    let uninstall

    afterEach(() => {
        uninstall?.()
        uninstall = null
        document.body.innerHTML = ''
    })

    it('prevents the native drag ghost for links and images', () => {
        uninstall = suppressNativeDrag()
        document.body.innerHTML = '<a href="/wiki">how content flows</a><img alt="">'
        expect(fireDragStart(document.querySelector('a')).defaultPrevented).toBe(true)
        expect(fireDragStart(document.querySelector('img')).defaultPrevented).toBe(true)
    })

    it('leaves elements that opt in with draggable="true" alone', () => {
        uninstall = suppressNativeDrag()
        document.body.innerHTML = '<div draggable="true"><span>handle</span></div>'
        expect(fireDragStart(document.querySelector('span')).defaultPrevented).toBe(false)
    })

    it('stops suppressing after uninstall', () => {
        const remove = suppressNativeDrag()
        remove()
        document.body.innerHTML = '<a href="/x">link</a>'
        expect(fireDragStart(document.querySelector('a')).defaultPrevented).toBe(false)
    })
})
