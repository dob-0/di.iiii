import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { buildVisualisePath, getVisualiseLocationState } from './visualiseRouting.js'
import VisualiserSurface, { assumedInUse } from './VisualiserSurface.jsx'
import { TYPE_LIBRARY } from './types/index.js'

vi.mock('../rigMirror/useLightingMirror.js', () => ({ useLightingDeskPresent: () => true }))
vi.mock('../hooks/useLocalInstall.js', () => ({ default: () => ({ isLocal: true }) }))
vi.mock('./RigSteps.jsx', () => ({ default: () => null }))

const lamp = (id, type, mode) => ({ id, type: 'spotLight', components: { fixture: { type, mode, index: 1 } } })

describe('the visualiser', () => {
    it('lives at /{space}/visualise/{project}, three segments exactly', () => {
        expect(buildVisualisePath('moxir', 'moxir-hall-minimal')).toBe('/moxir/visualise/moxir-hall-minimal')
        expect(getVisualiseLocationState({ pathname: '/moxir/visualise/moxir-hall-minimal' })).toEqual({ isVisualise: true, spaceId: 'moxir', projectId: 'moxir-hall-minimal' })
        expect(getVisualiseLocationState({ pathname: '/moxir/visualise' }).isVisualise).toBe(false)
    })

    it('names every ASSUMED list that drives a lamp, with its words; a real mode is not listed', () => {
        const rows = assumedInUse([lamp('a', 'up-b380f', '16ch-assumed'), lamp('b', 'up-b380f', '16ch-assumed'), lamp('c', 'up-b380f', '16ch'), lamp('d', 'up-pl5403', '8ch-assumed')], TYPE_LIBRARY)
        expect(rows.map((r) => [r.key, r.n])).toEqual([['UP-B380F 16ch-assumed', 2], ['UP-PL5403 8ch-assumed', 1]])
        expect(rows[0].words).toMatch(/^ASSUMED from UPlus 380 IP BEAM manual p\.6–8 — verify on the rental unit$/)
    })

    it('frames the real desk (from=visualise) and the real room (embedded, with its stopwatch), and says what is assumed', async () => {
        const loadDocument = async () => ({ document: { projectMeta: { title: 'MOXIR' }, entities: [lamp('a', 'up-b380f', '16ch-assumed')] } })
        render(<VisualiserSurface spaceId="moxir" projectId="moxir-hall-minimal" loadDocument={loadDocument} />)
        const desk = await screen.findByTitle('The light desk')
        expect(desk.getAttribute('src')).toBe('/light/?space=moxir&project=moxir-hall-minimal&label=MOXIR&from=visualise#touch') // opens on its looks and cue bar, not Setup
        expect(screen.getByTitle('The room').getAttribute('src')).toBe('/moxir/p/moxir-hall-minimal?probe=1&embed=1&views=1') // with its view chips
        expect(await screen.findByText(/ASSUMED channel lists drive 1 lamp — verify/)).toBeTruthy()
        expect(screen.getByRole('button', { name: /room ↗/ })).toBeTruthy()
    })
})
