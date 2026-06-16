// @vitest-environment node

import { mkdtemp, rm } from 'node:fs/promises'
import { createRequire } from 'node:module'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const {
    deleteProject,
    ensureProject,
    findProjectById,
    readProjectIndex
} = require('./projectStore.js')
const { initDb, closeDb } = require('./db.js')

const tempDirs = []

const createSpacesDir = async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'dii-project-store-'))
    tempDirs.push(dir)
    return dir
}

beforeEach(() => {
    initDb(':memory:')
})

afterEach(async () => {
    closeDb()
    await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

describe('projectStore', () => {
    it('creates a project and finds it by id', async () => {
        const spacesDir = await createSpacesDir()

        await ensureProject(spacesDir, 'main', 'alpha-project', { title: 'Alpha Project' })

        const resolved = await findProjectById(spacesDir, 'alpha-project')
        expect(resolved).toMatchObject({
            spaceId: 'main',
            projectId: 'alpha-project'
        })
        expect(resolved.meta.title).toBe('Alpha Project')
    })

    it('readProjectIndex returns a projectId→spaceId map from the DB', async () => {
        const spacesDir = await createSpacesDir()

        await ensureProject(spacesDir, 'main', 'alpha-project', { title: 'Alpha Project' })
        expect(await readProjectIndex(spacesDir)).toEqual({ 'alpha-project': 'main' })

        await deleteProject(spacesDir, 'main', 'alpha-project')
        expect(await readProjectIndex(spacesDir)).toEqual({})
    })

    it('findProjectById returns null for unknown projects', async () => {
        const spacesDir = await createSpacesDir()
        expect(await findProjectById(spacesDir, 'nonexistent')).toBeNull()
    })

    it('deleteProject removes the project from the DB and disk', async () => {
        const spacesDir = await createSpacesDir()
        await ensureProject(spacesDir, 'gallery', 'delete-me', { title: 'Delete Me' })
        expect(await findProjectById(spacesDir, 'delete-me')).not.toBeNull()

        await deleteProject(spacesDir, 'gallery', 'delete-me')
        expect(await findProjectById(spacesDir, 'delete-me')).toBeNull()
    })
})
