import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'

vi.mock('../../services/apiClient.js', () => ({
    getAgentBoard: vi.fn(),
    getAgentBoardSession: vi.fn()
}))

import { getAgentBoard, getAgentBoardSession } from '../../services/apiClient.js'
import AgentsSection from './AgentsSection.jsx'

const SESSION_ID = '2f85e3cf-0000-4ec5-b75d-043cd693e835'

const boardFixture = {
    generatedAt: '2026-08-08T10:00:00.000Z',
    totalSessions: 2,
    sessions: [
        {
            sessionId: SESSION_ID,
            title: 'Build the agents map',
            branch: 'feat/ops-agents-map',
            worktreePath: '/home/user/di.iiii-agents-map',
            cwd: '/home/user',
            model: 'claude-opus-5',
            messageCount: 12,
            lastActivity: '2026-08-08T10:00:00.000Z',
            live: { pid: 1234, kind: 'interactive', status: 'busy' }
        },
        {
            sessionId: 'aaaaaaaa-0000-4ec5-b75d-043cd693e835',
            title: 'Old finished chat',
            branch: 'dev',
            worktreePath: null,
            cwd: '/home/user',
            model: null,
            messageCount: 4,
            lastActivity: '2026-08-07T10:00:00.000Z',
            live: null
        }
    ],
    live: [{ pid: 1234, sessionId: SESSION_ID, status: 'busy', kind: 'interactive' }]
}

const detailFixture = {
    session: boardFixture.sessions[0],
    subagents: [
        { agentId: 'agent-1', agentType: 'Explore', description: 'survey the code', parentAgentId: null, spawnDepth: 1 }
    ],
    tail: [
        { role: 'user', text: 'build the thing', timestamp: '2026-08-08T09:59:00.000Z' },
        { role: 'assistant', text: 'building it now', timestamp: '2026-08-08T10:00:00.000Z' }
    ],
    job: null
}

beforeEach(() => {
    vi.clearAllMocks()
})

describe('AgentsSection', () => {
    it('renders the operator-only notice when the board 404s', async () => {
        const notFound = Object.assign(new Error('not found'), { status: 404 })
        getAgentBoard.mockRejectedValue(notFound)

        render(<AgentsSection />)

        await waitFor(() => {
            expect(screen.getByText(/Operator mode only/)).toBeTruthy()
        })
        expect(getAgentBoardSession).not.toHaveBeenCalled()
    })

    it('renders live sessions on the map and directory, loads detail on select', async () => {
        getAgentBoard.mockResolvedValue(boardFixture)
        getAgentBoardSession.mockResolvedValue(detailFixture)

        render(<AgentsSection />)

        await waitFor(() => {
            expect(screen.getByText(/1 live session · 2 total on this machine/)).toBeTruthy()
        })
        // session node on the map + its checkout node, linked
        expect(screen.getAllByText('Build the agents map').length).toBeGreaterThan(0)
        expect(screen.getByText('di.iiii-agents-map')).toBeTruthy()
        // recent (ended) session listed in the directory only
        expect(screen.getByText('Old finished chat')).toBeTruthy()

        fireEvent.click(screen.getAllByText('Build the agents map')[0])

        await waitFor(() => {
            expect(getAgentBoardSession).toHaveBeenCalledWith(SESSION_ID)
        })
        await waitFor(() => {
            expect(screen.getByText('survey the code')).toBeTruthy()
            expect(screen.getByText('build the thing')).toBeTruthy()
            expect(screen.getByText('building it now')).toBeTruthy()
        })
    })

    it('shows a board error without dropping the section', async () => {
        getAgentBoard.mockRejectedValue(new Error('scan failed'))

        render(<AgentsSection />)

        await waitFor(() => {
            expect(screen.getByText('scan failed')).toBeTruthy()
        })
        expect(screen.getByText('Agent Map')).toBeTruthy()
    })
})
