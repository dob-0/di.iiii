import { afterEach, describe, expect, it, vi } from 'vitest'
import { readMachineDevices } from './machineDevices.js'

afterEach(() => { vi.unstubAllGlobals() })

describe('what a machine says it has', () => {
    it('reports a scaled screen in real pixels, not CSS pixels', async () => {
        // A 1920×1080 laptop panel at 150% scaling: the browser says 1280×720.
        // The desk sizes a wall from this, so it has to be the panel's own size.
        vi.stubGlobal('navigator', { mediaDevices: { enumerateDevices: async () => [] } })
        vi.stubGlobal('screen', { width: 1280, height: 720 })
        vi.stubGlobal('devicePixelRatio', 1.5)
        const screens = (await readMachineDevices()).filter((device) => device.kind === 'screen')
        expect(screens).toEqual([{ kind: 'screen', id: 'screen-0', label: 'Screen', width: 1920, height: 1080 }])
    })

    it('leaves an unscaled screen as it is', async () => {
        vi.stubGlobal('navigator', { mediaDevices: { enumerateDevices: async () => [] } })
        vi.stubGlobal('screen', { width: 1920, height: 1080 })
        vi.stubGlobal('devicePixelRatio', 1)
        const screens = (await readMachineDevices()).filter((device) => device.kind === 'screen')
        expect(screens[0]).toMatchObject({ width: 1920, height: 1080 })
    })
})
