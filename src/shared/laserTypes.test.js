import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import * as browser from './laserTypes.js'

const require = createRequire(import.meta.url)
const server = require(path.join(path.dirname(fileURLToPath(import.meta.url)), '../../shared/laserMoments.cjs'))

describe('the one laser list (shared/laserMoments.cjs and its browser twin)', () => {
    it('the twins hold the same list', () => {
        expect(browser.LASER_TYPES).toEqual(server.LASER_TYPES)
        expect(browser.LASER_TYPE_IDS).toEqual(server.LASER_TYPE_IDS)
    })

    const docs = [
        [{ entities: [] }, 'no project types'],
        [{ entities: [{ id: 's', components: { rentalList: { items: [], types: [{ id: 'ofl-x-l7', category: 'laser' }, { id: 'ofl-x-p', category: 'par' }, { id: 'OFL-Y', category: 'LASER' }, { category: 'laser' }] } } }] }, 'a project laser, a par, a shouted one, one without id'],
        [[{ id: 's', components: { rentalList: { types: [{ id: 'up-la40wf', category: 'laser' }] } } }], 'entities, and a repeat of a library laser']
    ]
    it.each(docs)('the twins agree on a project\'s laser ids: %#, %s', (doc) => {
        expect([...browser.laserTypeIdsOf(doc)].sort()).toEqual([...server.laserTypeIdsOf(doc)].sort())
    })

    it('a project laser joins the library\'s; a project par does not', () => {
        expect([...browser.laserTypeIdsOf(docs[1][0])].sort()).toEqual(['ext-lc-ultra-mk2', 'ofl-x-l7', 'ofl-y', 'up-la40wf'])
    })
})
