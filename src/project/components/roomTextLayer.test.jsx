import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import RoomTextLayer from './RoomTextLayer.jsx'

// `/` is a room drawn on a canvas, so the page a reader receives is otherwise
// empty: a search engine, a screen reader, or a visitor whose WebGL failed gets
// the head's title and nothing else. This is the body under it, and it must
// always be the SAME content the room shows — never a separate story.
const portal = (id, label, spaceId, projectId) => ({
    id,
    type: 'portal',
    name: label,
    components: { reference: { label, spaceId, projectId } }
})

const text = (id, value) => ({
    id,
    type: 'text',
    components: { text: { value, variant: '3d' } }
})

describe('RoomTextLayer', () => {
    it('names the room and carries its lines as readable text', () => {
        render(<RoomTextLayer title="Everything made here" spaceId="main" entities={[
            text('t1', 'a link while it runs,\na file when it ends')
        ]} />)

        expect(screen.getByRole('heading', { name: 'Everything made here' })).toBeInTheDocument()
        // The newline in the 3D text is a layout decision, not a sentence break.
        expect(screen.getByText('a link while it runs, a file when it ends')).toBeInTheDocument()
    })

    it('turns every door into a real link, so the works are reachable without a canvas', () => {
        render(<RoomTextLayer title="Everything made here" spaceId="main" entities={[
            portal('d1', 'WCC Exhibition', 'wcc', null),
            portal('d2', 'br_id_ge', 'br_id_ge', null)
        ]} />)

        expect(screen.getByRole('link', { name: 'WCC Exhibition' })).toHaveAttribute('href', '/wcc')
        expect(screen.getByRole('link', { name: 'br_id_ge' })).toHaveAttribute('href', '/br_id_ge')
    })

    it('points at the project inside a space when the door names one', () => {
        render(<RoomTextLayer title="Room" spaceId="main" entities={[
            portal('d1', 'A den', 'dilijan', 'room-1')
        ]} />)

        expect(screen.getByRole('link', { name: 'A den' })).toHaveAttribute('href', '/dilijan/room-1')
    })

    it('falls back to the room it is in for a door with no space of its own', () => {
        render(<RoomTextLayer title="Room" spaceId="main" entities={[
            { id: 'd1', type: 'portal', name: 'Inner', components: { reference: { projectId: 'inner' } } }
        ]} />)

        expect(screen.getByRole('link', { name: 'Inner' })).toHaveAttribute('href', '/main/inner')
    })

    it('renders no door list at all in a room without doors', () => {
        render(<RoomTextLayer title="Quiet room" spaceId="wcc" entities={[]} />)

        expect(screen.getByRole('heading', { name: 'Quiet room' })).toBeInTheDocument()
        expect(screen.queryByRole('navigation')).toBeNull()
    })
})
