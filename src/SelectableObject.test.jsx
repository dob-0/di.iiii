import { describe, expect, it, vi } from 'vitest'
import { createSingleObjectGizmoDragController } from './utils/singleObjectGizmoDrag.js'

const createListenerRegistry = () => {
    const listeners = new Map()
    return {
        add: (type, handler) => {
            listeners.set(type, handler)
        },
        remove: (type, handler) => {
            if (listeners.get(type) === handler) {
                listeners.delete(type)
            }
        },
        emit: (type) => {
            listeners.get(type)?.()
        },
        has: (type) => listeners.has(type)
    }
}

describe('createSingleObjectGizmoDragController', () => {
    it('toggles drag state from dragging-changed events and persists the final transform once', () => {
        const registry = createListenerRegistry()
        const persistTransform = vi.fn()
        const setPointerDragging = vi.fn()
        const setOrbitControlsEnabled = vi.fn()
        const resetAxisLock = vi.fn()

        const controller = createSingleObjectGizmoDragController({
            persistTransform,
            setPointerDragging,
            setOrbitControlsEnabled,
            resetAxisLock,
            addWindowListener: registry.add,
            removeWindowListener: registry.remove
        })

        controller.handleDraggingChanged({ value: true })

        expect(controller.getIsDragging()).toBe(true)
        expect(setPointerDragging).toHaveBeenLastCalledWith(true)
        expect(setOrbitControlsEnabled).toHaveBeenLastCalledWith(false)
        expect(registry.has('pointerup')).toBe(true)
        expect(registry.has('pointercancel')).toBe(true)
        expect(registry.has('blur')).toBe(true)

        controller.handleChange()
        expect(persistTransform).toHaveBeenCalledTimes(1)

        controller.handleDraggingChanged({ value: false })

        expect(controller.getIsDragging()).toBe(false)
        expect(setPointerDragging).toHaveBeenLastCalledWith(false)
        expect(setOrbitControlsEnabled).toHaveBeenLastCalledWith(true)
        expect(persistTransform).toHaveBeenCalledTimes(2)
        expect(resetAxisLock).toHaveBeenCalledTimes(1)
        expect(registry.has('pointerup')).toBe(false)
    })

    it('forces cleanup when the window misses a normal drag-end event', () => {
        const registry = createListenerRegistry()
        const persistTransform = vi.fn()
        const setPointerDragging = vi.fn()
        const setOrbitControlsEnabled = vi.fn()
        const resetAxisLock = vi.fn()

        const controller = createSingleObjectGizmoDragController({
            persistTransform,
            setPointerDragging,
            setOrbitControlsEnabled,
            resetAxisLock,
            addWindowListener: registry.add,
            removeWindowListener: registry.remove
        })

        controller.handleDraggingChanged({ value: true })
        registry.emit('pointercancel')

        expect(controller.getIsDragging()).toBe(false)
        expect(setPointerDragging).toHaveBeenLastCalledWith(false)
        expect(setOrbitControlsEnabled).toHaveBeenLastCalledWith(true)
        expect(persistTransform).toHaveBeenCalledTimes(1)
        expect(resetAxisLock).toHaveBeenCalledTimes(1)
        expect(registry.has('blur')).toBe(false)
    })
})
