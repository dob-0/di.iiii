import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import RootApp from './RootApp.jsx'

vi.mock('./App.jsx', () => ({
    default: function MockApp() {
        return <div>legacy-app</div>
    }
}))

vi.mock('./beta/BetaApp.jsx', () => ({
    default: function MockBetaApp({ initialRoute }) {
        return <div>beta-app:{initialRoute?.page}</div>
    }
}))

vi.mock('./studio/StudioApp.jsx', () => ({
    default: function MockStudioApp({ initialRoute }) {
        return <div>studio-app:{initialRoute?.page}</div>
    }
}))

describe('RootApp', () => {
    afterEach(() => {
        window.history.pushState({}, '', '/')
    })

    it('renders the studio hub on /studio', () => {
        window.history.pushState({}, '', '/studio')
        render(<RootApp />)

        expect(screen.getByText('studio-app:hub')).toBeInTheDocument()
    })

    it('renders the studio editor route on /studio/projects/:id', () => {
        window.history.pushState({}, '', '/studio/projects/test-project')
        render(<RootApp />)

        expect(screen.getByText('studio-app:project')).toBeInTheDocument()
    })

    it('keeps beta and legacy routes intact', () => {
        window.history.pushState({}, '', '/beta')
        const { unmount } = render(<RootApp />)
        expect(screen.getByText('beta-app:hub')).toBeInTheDocument()
        unmount()

        window.history.pushState({}, '', '/main')
        render(<RootApp />)
        expect(screen.getByText('legacy-app')).toBeInTheDocument()
    })
})
