import React from 'react'
import { render, screen, cleanup } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import SceneBar, { EditInStudio, studioHref } from './SceneBar.jsx'

afterEach(cleanup)

describe('the scene bar', () => {
    it('Edit in Studio is a real link to /{space}/{project}/studio', () => {
        expect(studioHref('moxir', 'v2-6')).toMatch(/\/moxir\/v2-6\/studio$/)
        render(<EditInStudio spaceId="moxir" projectId="v2-6" />)
        const a = screen.getByRole('link', { name: 'Edit in Studio' })
        expect(a.getAttribute('href')).toMatch(/\/moxir\/v2-6\/studio$/)
    })
    it('no link without a space and a project', () => {
        render(<EditInStudio spaceId="" projectId="x" />)
        expect(screen.queryByRole('link')).toBeNull()
    })
    it('is one rectangle strip: left cells, right cells, the corner dev chip gives way', () => {
        render(<SceneBar left={<span>L</span>} right={<span>R</span>} />)
        const bar = screen.getByTestId('scene-bar')
        expect(parseFloat(bar.style.borderRadius)).toBeLessThanOrEqual(2)
        expect(bar.textContent).toContain('L')
        expect(bar.textContent).toContain('R')
        expect(document.documentElement.getAttribute('data-scene-bar')).toBe('1')
        cleanup()
        expect(document.documentElement.hasAttribute('data-scene-bar')).toBe(false)
    })
})
