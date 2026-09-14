import { act, fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import TopInsidePanel from './TopInsidePanel.jsx'
import { reportTop } from '../../../project/tops/topReports.js'
import { TOP_OPERATORS } from '../../../project/tops/topOperators.js'

const camera = (values = {}) => ({ id: 'cam-1', typeId: 'top.camera', label: 'Camera In', values: { machine: 'asuz', ...values } })
const machines = [{ id: 'asuz', name: 'asuz', self: false, scripts: false }, { id: 'pc', name: 'aylmo', self: true, scripts: true }]

describe('inside a picture operator', () => {
    it('shows where it runs and the real camera, and turns a control into constraints', () => {
        const onPatchValues = vi.fn()
        const { container } = render(<TopInsidePanel node={camera()} machines={machines} onPatchValues={onPatchValues} />)
        expect(container.querySelector('.raw-top-inside-where').textContent).toBe('runs on asuz')
        act(() => reportTop('cam-1', {
            camera: {
                label: 'USB2.0 HD UVC WebCam',
                capabilities: { width: { min: 160, max: 1280 }, height: { min: 120, max: 720 }, exposureMode: ['manual', 'continuous'], brightness: { min: -64, max: 64, step: 1 } },
                settings: { width: 640, height: 480, frameRate: 30, brightness: 0, exposureMode: 'continuous' }
            }
        }))
        expect(screen.getByText('USB2.0 HD UVC WebCam')).toBeTruthy()
        fireEvent.change(screen.getByLabelText('Brightness'), { target: { value: '12' } })
        expect(onPatchValues).toHaveBeenLastCalledWith({ __constraints: { brightness: 12 } })
        fireEvent.change(screen.getByLabelText('Exposure'), { target: { value: 'manual' } })
        expect(onPatchValues).toHaveBeenLastCalledWith({ __constraints: { exposureMode: 'manual' } })
    })

    it('shows the real shader, applies an edit, and goes back to the original', () => {
        const onPatchValues = vi.fn()
        const node = { id: 'lvl', typeId: 'top.level', label: 'Level', values: {} }
        const { rerender } = render(<TopInsidePanel node={node} machines={machines} onPatchValues={onPatchValues} />)
        const code = screen.getAllByRole('textbox').find((box) => box.value.includes('p_gain'))
        expect(code.value.trim()).toBe(TOP_OPERATORS['top.level'].fragment.trim())
        fireEvent.change(code, { target: { value: `${code.value}\n// mine` } })
        fireEvent.click(screen.getAllByRole('button', { name: /Apply/ })[0])
        expect(onPatchValues.mock.calls.at(-1)[0].__shader).toContain('// mine')
        rerender(<TopInsidePanel node={{ ...node, values: { __shader: onPatchValues.mock.calls.at(-1)[0].__shader } }} machines={machines} onPatchValues={onPatchValues} />)
        fireEvent.click(screen.getByRole('button', { name: 'Back to the original' }))
        expect(onPatchValues).toHaveBeenLastCalledWith({ __shader: '' })
    })

    it('says plainly when the machine it runs on does not run desk scripts, and refuses code that does not parse', () => {
        const onPatchValues = vi.fn()
        render(<TopInsidePanel node={camera()} machines={machines} onPatchValues={onPatchValues} />)
        expect(screen.getByText(/does not run desk scripts/)).toBeTruthy()
        const script = screen.getAllByRole('textbox').find((box) => box.placeholder?.includes('async function open'))
        fireEvent.change(script, { target: { value: 'function frame( {' } })
        fireEvent.click(screen.getAllByRole('button', { name: /Apply/ }).at(-1))
        expect(onPatchValues).not.toHaveBeenCalledWith(expect.objectContaining({ __script: expect.anything() }))
    })
})
