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

    it('says calmly that a machine has no NDI runtime, in the server\'s own words, with the licence line beside it', () => {
        // No runtime is the ordinary case on most machines: a dim sentence,
        // never the error colour, never a scolding.
        const node = { id: 'send-1', typeId: 'top.send', label: 'Send Out', values: { machine: 'pc', name: 'di test' } }
        const { container } = render(<TopInsidePanel node={node} machines={machines} onPatchValues={vi.fn()} />)
        expect(screen.getByText('di test')).toBeTruthy()
        act(() => reportTop('send-1', { send: { state: 'unavailable', reason: 'not-installed', how: 'Install NDI Tools from ndi.video on aylmo.', frames: 0, dropped: 0 } }))
        expect(screen.getByText(/Install NDI Tools from ndi\.video on aylmo\./).className).toBe('raw-top-inside-dim')
        expect(container.querySelector('.raw-top-inside-error')).toBeNull()
        expect(screen.getByText(/NDI® is a registered trademark of Vizrt NDI AB\./)).toBeTruthy()
        expect(container.querySelector('a[href="https://ndi.video"]').textContent).toBe('ndi.video')
        act(() => reportTop('send-1', { send: { state: 'sending', frames: 120, dropped: 7, viewers: 1 } }))
        expect(screen.getByText(/120 frames so far, 7 skipped/)).toBeTruthy()
    })

    it('tells an unnamed Send Out what a name would do, and offers p_name to no shader', () => {
        const node = { id: 'send-2', typeId: 'top.send', label: 'Send Out', values: {} }
        render(<TopInsidePanel node={node} machines={machines} onPatchValues={vi.fn()} />)
        expect(screen.getByText('not named yet')).toBeTruthy()
        expect(screen.getByText(/Give it a name in the sheet/)).toBeTruthy()
        expect(screen.getByText(/You can read:/).textContent).not.toContain('p_name')
    })
})
