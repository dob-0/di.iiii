import { describe, expect, it } from 'vitest'
import { northFromSite, planExtent, venueOf, venuePlanFromHall } from './venuePlan.js'
import { normalizeVenuePlan } from '../shared/projectSchema.js'

// A cut-down hall.json in the shape scripts/place/hall.py v2 writes (MOXIR's numbers).
const HALL = {
    version: 2,
    createdAt: '2026-09-27T23:04:17Z',
    warning: 'ESTIMATED from photographs, not taped',
    dims: { column_w_m: 0.5, column_d_m: 0.8 },
    geometry: {
        walls_x_m: [-36.4, 60.4],
        rows_x_m: [-36, -12, 12, 36, 60],
        end_wall_inner_y_m: 54.5,
        column_grid_z_m: [54, 48, 6, 0.5, -0.5, -54],
        crane_rail_x_m: 11.35,
        runway_bottom_m: 6.56,
        cranes: [{ z_m: 50, girder_bottom_m: 8.15 }],
        lanterns: [{ x_m: [-6, 6], z_m: [7.25, 45.75] }],
        deck_m: 13.55,
        door: { z_m: 54.5, w_m: 6 },
        far_gate: { z_m: -54.5, w_m: 4.8 },
        massing: [{ id: 'press', label: 'forging press (body)', x_m: [0.25, 3.05], z_m: [0.2, 3.2], y_m: [0, 4.5] }],
        zones: {
            _label: 'owner marked',
            dance: { label: 'dance floor', used: { x_m: [-10, 10], z_m: [22, 48] }, extra: [{ x_m: [-10, 3.5], z_m: [7.5, 22] }], clear: 'bags must be moved' },
            stage: { label: 'DJ place', used: { x_m: [-2.2, 5.5], z_m: [3.6, 7.5] } }
        }
    }
}

// The real site file's numbers (scripts/place/rigs/moxir-site-2026-09-28.json).
const SITE = {
    u_bearing_deg: 54, v_bearing_deg: 144,
    hall_from_building: { x: 'x = nave_u_m - u (hall +x = SW)', z: 'z = -(v - joint_v_m) (hall +z = NW, the entry end)' }
}

describe('venuePlanFromHall', () => {
    const plan = venuePlanFromHall(HALL, { name: 'MOXIR', site: SITE })

    it('draws the inside of the walls as a closed ring', () => {
        expect(plan.outline).toEqual([[-36.4, -54.5], [60.4, -54.5], [60.4, 54.5], [-36.4, 54.5]])
        expect(planExtent(plan)).toEqual([-36.4, -54.5, 60.4, 54.5])
    })

    it('puts a column on every row at every grid line, 0.8 across by 0.5 along', () => {
        expect(plan.columns).toHaveLength(5 * 6)
        expect(plan.columns).toContainEqual([-12, 0.5, 0.8, 0.5])
    })

    it('letters the rows, numbers the lines from the entry, primes the joint pair', () => {
        expect(plan.grid.x.map((g) => g.label)).toEqual(['A', 'B', 'C', 'D', 'E'])
        expect(plan.grid.z.map((g) => g.label)).toEqual(['1', '2', '3', '4', '4′', '5'])
    })

    it('carries the zones the show uses, skipping notes, and what stands and hangs', () => {
        expect(plan.zones.map((z) => z.id)).toEqual(['dance', 'stage'])
        expect(plan.zones[0].rects).toEqual([[-10, 22, 10, 48], [-10, 7.5, 3.5, 22]])
        expect(plan.solids[0]).toMatchObject({ id: 'press', rect: [0.25, 0.2, 3.05, 3.2], top: 4.5 })
        expect(plan.overhead.map((o) => o.id)).toEqual(['lantern-1', 'crane-1', 'runway-l', 'runway-r'])
        expect(plan.openings[0]).toMatchObject({ from: [-3, 54.5], to: [3, 54.5] })
    })

    it('points north from the site bearings (u at 54°, v at 144°; x = -u, z = -v)', () => {
        // North is bearing 0: cos(-54°) u + sin(-54°) v = 0.588 u - 0.809 v -> x -0.588, z +0.809.
        expect(plan.north).toEqual([-0.588, 0.809])
        expect(northFromSite(null)).toBeNull()
    })

    it('survives the document schema unchanged', () => {
        expect(normalizeVenuePlan(plan)).toEqual(plan)
    })

    it('refuses what is not a hall.json', () => {
        expect(() => venuePlanFromHall({})).toThrow(/not a hall.json/)
    })

    it('finds the venue entity in a document', () => {
        const entities = [{ id: 'a', components: {} }, { id: 'hall', components: { venuePlan: plan } }]
        expect(venueOf(entities).entity.id).toBe('hall')
        expect(venueOf([]).plan).toBeNull()
    })
})
