import { act, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import ModelLoading, { modelLoadingLabel } from './ModelLoading.jsx'
import { reportModelLoad } from '../../objectComponents/modelLoads.js'

describe('ModelLoading: shown while the place loads, gone when it is in', () => {
    it('says how far, and leaves when the last model is in', () => {
        render(<ModelLoading />)
        expect(screen.queryByRole('status')).toBeNull()
        let a, b
        act(() => { a = reportModelLoad(); b = reportModelLoad() })
        expect(screen.getByRole('status').textContent).toContain('Loading the place · 0 of 2')
        act(() => a())
        expect(screen.getByRole('status').textContent).toContain('1 of 2')
        act(() => b())
        expect(screen.queryByRole('status')).toBeNull()
    })
    it('one model: no count', () => {
        expect(modelLoadingLabel({ done: 0, total: 1 })).toBe('Loading the place')
    })
})
