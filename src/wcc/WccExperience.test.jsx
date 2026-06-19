import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import WccExperience from './WccExperience.jsx'

// gsap timeline is a no-op that fires onComplete synchronously so the
// "entering" -> "scene" transition resolves without real animation timing.
vi.mock('gsap', () => {
    const makeTimeline = (opts = {}) => {
        const tl = {
            to: () => tl,
            fromTo: () => tl,
            kill: () => {}
        }
        if (typeof opts.onComplete === 'function') {
            Promise.resolve().then(opts.onComplete)
        }
        return tl
    }
    return { default: { timeline: makeTimeline } }
})

vi.mock('./landing/LandingPage.jsx', () => ({
    default: function MockLanding({ onEnterExhibition }) {
        return (
            <button type="button" onClick={() => onEnterExhibition?.()}>
                mock-enter
            </button>
        )
    }
}))

vi.mock('../project/components/PublicProjectViewer.jsx', () => ({
    default: function MockViewer({ projectId, initialCameraView }) {
        return (
            <div>
                viewer:{projectId}:cam={initialCameraView ? 'yes' : 'no'}
            </div>
        )
    }
}))

vi.mock('../project/services/projectsApi.js', () => ({
    getProjectDocument: vi.fn(() => Promise.resolve({
        document: {
            worldState: { backgroundColor: '#fff9fb' },
            entities: [
                {
                    name: 'Entrance - Threshold gate',
                    components: { transform: { position: [3.4, 2.4, 4.7] } }
                }
            ]
        }
    }))
}))

describe('WccExperience', () => {
    afterEach(() => {
        window.history.pushState({}, '', '/wcc')
    })

    it('renders the 2D landing in landing mode', () => {
        render(<WccExperience initialMode="landing" />)
        expect(screen.getByText('mock-enter')).toBeInTheDocument()
        expect(screen.queryByText(/^viewer:/)).not.toBeInTheDocument()
    })

    it('renders the exhibition viewer with an entry camera on direct scene load', async () => {
        window.history.pushState({}, '', '/wcc/scene')
        render(<WccExperience initialMode="scene" />)
        expect(await screen.findByText('viewer:wcc:cam=yes')).toBeInTheDocument()
    })

    it('dives from landing into the exhibition and updates the URL', async () => {
        window.history.pushState({}, '', '/wcc')
        render(<WccExperience initialMode="landing" />)
        fireEvent.click(screen.getByText('mock-enter'))
        expect(window.location.pathname).toBe('/wcc/scene')
        expect(await screen.findByText('viewer:wcc:cam=yes')).toBeInTheDocument()
        await waitFor(() => {
            expect(screen.queryByText('mock-enter')).not.toBeInTheDocument()
        })
    })
})
