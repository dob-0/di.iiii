// @vitest-environment node

import { mkdtemp, rm } from 'node:fs/promises'
import { createRequire } from 'node:module'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const {
    deleteProject,
    ensureProject,
    findProjectById,
    readProjectIndex,
    writeProjectIndex
} = require('./projectStore.js')

const tempDirs = []

const createSpacesDir = async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'dii-project-store-'))
    tempDirs.push(dir)
    return dir
}

afterEach(async () => {
    await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

describe('projectStore index', () => {
    it('updates project-index.json on create and delete', async () => {
        const spacesDir = await createSpacesDir()

        await ensureProject(spacesDir, 'main', 'alpha-project', { title: 'Alpha Project' })
        expect(await readProjectIndex(spacesDir)).toEqual({
            'alpha-project': 'main'
        })

        await deleteProject(spacesDir, 'main', 'alpha-project')
        expect(await readProjectIndex(spacesDir)).toEqual({})
    })

    it('repairs a stale index entry when a lookup points at the wrong space', async () => {
        const spacesDir = await createSpacesDir()

        await ensureProject(spacesDir, 'main', 'stale-project', { title: 'Stale Project' })
        await writeProjectIndex(spacesDir, {
            'stale-project': 'gallery'
        })

        const resolved = await findProjectById(spacesDir, 'stale-project')

        expect(resolved).toMatchObject({
            spaceId: 'main',
            projectId: 'stale-project'
        })
        expect(await readProjectIndex(spacesDir)).toEqual({
            'stale-project': 'main'
        })
    })

    it('repairs a missing index by scanning spaces once and writing the result back', async () => {
        const spacesDir = await createSpacesDir()

        await ensureProject(spacesDir, 'gallery', 'repair-project', { title: 'Repair Project' })
        await writeProjectIndex(spacesDir, {})

        const resolved = await findProjectById(spacesDir, 'repair-project')

        expect(resolved).toMatchObject({
            spaceId: 'gallery',
            projectId: 'repair-project'
        })
        expect(await readProjectIndex(spacesDir)).toEqual({
            'repair-project': 'gallery'
        })
    })
})
