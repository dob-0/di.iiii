import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import ToolsRoom from './ToolsRoom.jsx'
import { appNavigate } from '../utils/appNavigate.js'

vi.mock('../project/services/projectsApi.js', () => ({
    createProject: vi.fn(),
    listProjects: vi.fn(async () => [])
}))

vi.mock('../services/serverSpaces.js', () => ({
    listServerSpaces: vi.fn(async () => [])
}))

vi.mock('../utils/appNavigate.js', () => ({
    appNavigate: vi.fn(),
    setAppNavigate: () => {}
}))

const tile = (name) => [...document.querySelectorAll('.tr-tile')]
    .find((el) => el.querySelector('.tr-tile-name')?.textContent === name) || null

describe('/tools — Light on every tier', () => {
    beforeEach(() => {
        appNavigate.mockClear()
    })

    it('opens the desk itself on a local install', () => {
        render(<ToolsRoom isLocalInstall />)
        const light = tile('Light')
        expect(light.getAttribute('href')).toBe('/light/')
        expect(light.querySelector('.tr-tile-meta').textContent).toBe('Art-Net · output off')
    })

    it('is shown on a hosted tier too, says where it runs, and opens its card without a page load', () => {
        render(<ToolsRoom />)
        const light = tile('Light')
        expect(light).toBeTruthy()
        expect(light.querySelector('.tr-tile-meta').textContent).toBe('on your own machine')
        expect(light.getAttribute('href')).toBe('/light')
        fireEvent.click(light)
        expect(appNavigate).toHaveBeenCalledWith('/light')
    })

    it('keeps the sessions tile to the machine it runs on', () => {
        render(<ToolsRoom />)
        expect(tile('Desk')).toBeNull()
        expect(screen.queryByText('This machine')).toBeNull()
    })
})
