import { describe, expect, it } from 'vitest'
import { getSurfaceWorkflow } from './surfaceWorkflow.js'

describe('getSurfaceWorkflow', () => {
    it('returns world guidance', () => {
        expect(getSurfaceWorkflow('world')).toMatchObject({
            title: 'World builds the scene',
            actionLabel: 'Place Node'
        })
    })

    it('returns view guidance', () => {
        expect(getSurfaceWorkflow('view')).toMatchObject({
            title: 'View builds the interface',
            actionLabel: 'Place Node'
        })
    })

    it('defaults to graph guidance', () => {
        expect(getSurfaceWorkflow('graph')).toMatchObject({
            title: 'Graph connects everything',
            actionLabel: 'Place Node'
        })
        expect(getSurfaceWorkflow('unknown')).toMatchObject({
            title: 'Graph connects everything'
        })
    })
})
