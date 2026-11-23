import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import * as browser from './laserShapes.js'

const require = createRequire(import.meta.url)
const dir = path.dirname(fileURLToPath(import.meta.url))
const server = require(path.join(dir, '../../shared/laserShapes.cjs'))

// The Laser node's shapes have one source (shared/laserShapes.cjs) since the laser desk draws them on the server
// (2026-10-29). The node, its browser twin and the server must give the same frame for the same knobs.
describe('the laser shapes (shared/laserShapes.cjs, its browser twin and the node)', () => {
    it('the browser twin is generated from the .cjs, byte for byte', async () => {
        const { buildTwin } = await import('../../scripts/laser/laser-frame-twin.mjs')
        const onDisk = fs.readFileSync(path.join(dir, 'laserShapes.js'), 'utf8').replace(/\r\n/g, '\n')
        expect(onDisk).toBe(buildTwin(fs.readFileSync(path.join(dir, '../../shared/laserShapes.cjs'), 'utf8'), 'laserShapes'))
    })
    // The node's old import path is checked in src/project/nodes/laser.shape/laserShapes.test.js: a test here that
    // imports the node graph would sit outside `npm run test:raw` (src/raw/rawTestScope.test.js).
    it.each(server.LASER_SHAPES)('server and browser draw %s the same', (shape) => {
        const knobs = { shape, size: 0.7, height: 0.3, rotation: 0.1, spin: 0.25, time: 3.2, colour: '#ff2040', level: 0.8, points: 300, copies: 0, rainbow: shape === 'galaxy', cycle: 0 }
        expect(browser.generateShape(knobs)).toEqual(server.generateShape(knobs))
    })
    it('a cycle list picks the same shape on both sides', () => {
        const knobs = { shape: 'galaxy,sunflower,noisy,grid', cycle: 2, time: 5.1, points: 200 }
        expect(browser.generateShape(knobs)).toEqual(server.generateShape(knobs))
    })
})
