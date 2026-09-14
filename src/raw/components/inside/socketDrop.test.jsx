import { fireEvent, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import RawGraphSurface from '../RawGraphSurface.jsx'
import { createNode } from '../../../project/nodeRegistry.js'

// A wire dragged from a card standing inside a node, released on the IN
// rail's socket for one of that node's own inputs — the drag path of the
// custom Cube. The socket lives outside the canvas, so the surface finds it by
// what is under the pointer (jsdom has no layout, so that lookup is stubbed).

const socketFor = ({ node = 'cube', port = 'size', type = 'vec3' } = {}) => {
    const socket = window.document.createElement('button')
    socket.setAttribute('data-wire-drop-node', node)
    socket.setAttribute('data-wire-drop-port', port)
    socket.setAttribute('data-wire-drop-type', type)
    window.document.body.appendChild(socket)
    return socket
}

const drag = (onCreateEdge, socket) => {
    const inner = { ...createNode('value.vec3', { graphX: 0, graphY: 0 }), id: 'big', parentId: 'cube' }
    const { container } = render(<RawGraphSurface nodes={[inner]} edges={[]} onCreateEdge={onCreateEdge} />)
    const outputDot = container.querySelector('.raw-graph-port-dot--out')
    window.document.elementFromPoint = vi.fn(() => socket)
    fireEvent.pointerDown(outputDot, { button: 0, pointerId: 3, clientX: 200, clientY: 60 })
    fireEvent.pointerUp(window, { pointerId: 3, clientX: 40, clientY: 400 })
}

describe('a wire dropped on the inside frame socket', () => {
    afterEach(() => {
        delete window.document.elementFromPoint
        window.document.body.innerHTML = ''
    })

    it('wires the inner card into the parent input', () => {
        const onCreateEdge = vi.fn()
        drag(onCreateEdge, socketFor())
        expect(onCreateEdge).toHaveBeenCalledWith({ fromNodeId: 'big', fromPort: 'out', toNodeId: 'cube', toPort: 'size' })
    })

    it('refuses a socket whose type cannot take the wire', () => {
        const onCreateEdge = vi.fn()
        drag(onCreateEdge, socketFor({ port: 'roughness', type: 'number' }))
        expect(onCreateEdge).not.toHaveBeenCalled()
    })
})
