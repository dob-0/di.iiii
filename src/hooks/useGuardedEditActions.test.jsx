import { act, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useGuardedEditActions } from './useGuardedEditActions.js'
import { useEditorShortcuts } from './useEditorShortcuts.js'
import { useSceneActions } from './useSceneActions.js'

let session = { authenticated: false, role: null }
vi.mock('./useAuthSession.js', () => ({
    default: () => session
}))

// The old editor opens for anyone on a public space with nothing published.
// Both ways into admin mode -- the Shift+D Shift+I chord and the 4-finger
// 3-second hold -- run through the real toggleAdminMode here, wired exactly
// as useAppState wires them.
function Harness({ startInAdmin = false }) {
    const [isAdminMode, setIsAdminMode] = useState(startInAdmin)
    const [, setIsGizmoVisible] = useState(false)
    const { toggleAdminMode } = useGuardedEditActions({ setIsAdminMode, setIsGizmoVisible })
    useEditorShortcuts({ toggleAdminMode })
    useSceneActions({ toggleAdminMode, objects: [], selectedObjectIds: [] })
    return <p>{isAdminMode ? 'admin on' : 'admin off'}</p>
}

const pressChord = () => {
    fireEvent.keyDown(window, { key: 'D', shiftKey: true })
    fireEvent.keyDown(window, { key: 'I', shiftKey: true })
}

const holdFourFingers = () => {
    const touches = [0, 1, 2, 3].map((identifier) => ({ identifier, clientX: 10 * identifier, clientY: 10 }))
    fireEvent.touchStart(window, { touches })
    act(() => { vi.advanceTimersByTime(3000) })
    fireEvent.touchEnd(window, { touches: [] })
}

describe('admin mode needs a signed-in admin', () => {
    beforeEach(() => { vi.useFakeTimers() })
    afterEach(() => { vi.useRealTimers() })

    it('ignores the Shift+D Shift+I chord when signed out', () => {
        session = { authenticated: false, role: null }
        render(<Harness />)
        pressChord()
        expect(screen.getByText('admin off')).toBeInTheDocument()
    })

    it('ignores the 4-finger hold when signed out', () => {
        session = { authenticated: false, role: null }
        render(<Harness />)
        holdFourFingers()
        expect(screen.getByText('admin off')).toBeInTheDocument()
    })

    it('ignores both for a signed-in person who is not an admin', () => {
        session = { authenticated: true, role: 'user' }
        render(<Harness />)
        pressChord()
        holdFourFingers()
        expect(screen.getByText('admin off')).toBeInTheDocument()
    })

    it('turns admin mode on and off with the chord for a signed-in admin', () => {
        session = { authenticated: true, role: 'admin' }
        render(<Harness />)
        pressChord()
        expect(screen.getByText('admin on')).toBeInTheDocument()
        pressChord()
        expect(screen.getByText('admin off')).toBeInTheDocument()
    })

    it('turns admin mode on with the 4-finger hold for a signed-in admin', () => {
        session = { authenticated: true, role: 'admin' }
        render(<Harness />)
        holdFourFingers()
        expect(screen.getByText('admin on')).toBeInTheDocument()
    })

    it('always lets admin mode be turned off', () => {
        session = { authenticated: false, role: null }
        render(<Harness startInAdmin />)
        pressChord()
        expect(screen.getByText('admin off')).toBeInTheDocument()
    })
})
