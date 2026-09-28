import { describe, expect, it } from 'vitest'
import { buildEquipmentPath, getEquipmentLocationState, isEquipmentLocation } from './equipmentRouting.js'
import { RESERVED_APP_SEGMENTS } from '../utils/spaceRouting.js'

describe('/{space}/equipment/{project}', () => {
    it('reads the three segments and builds the path', () => {
        expect(getEquipmentLocationState({ pathname: '/moxir/equipment/moxir-hall' })).toEqual({ isEquipment: true, spaceId: 'moxir', projectId: 'moxir-hall' })
        expect(isEquipmentLocation(getEquipmentLocationState({ pathname: '/moxir/equipment' }))).toBe(false)
        expect(isEquipmentLocation(getEquipmentLocationState({ pathname: '/moxir/cards/moxir-hall' }))).toBe(false)
        expect(buildEquipmentPath('moxir', 'moxir-hall')).toMatch(/\/moxir\/equipment\/moxir-hall$/)
    })
    it('is a reserved word, so no space or project can take it', () => {
        expect(RESERVED_APP_SEGMENTS).toContain('equipment')
    })
})
