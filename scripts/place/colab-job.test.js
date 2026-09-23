import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
    findMeshroomResult,
    readsAsSignedOut, readsAsLostSession, parseStatusLines, planChunks,
    CHUNK_BYTES, SILENT_POLLS_BEFORE_GIVING_UP
} from './colab-job.mjs'

describe('readsAsSignedOut', () => {
    it('knows the consent link and the prompt for the code', () => {
        expect(readsAsSignedOut('To authorize colab-cli, visit https://accounts.google.com/o/oauth2/auth?x=1')).toBe(true)
        expect(readsAsSignedOut('Enter the authorization code:')).toBe(true)
        expect(readsAsSignedOut('gcloud auth application-default login --scopes=...')).toBe(true)
    })

    it('does not read a healthy session listing as signed out', () => {
        expect(readsAsSignedOut('[place-moxir] gpu-l4-s-kkb | Hardware: L4 | Variant: GPU')).toBe(false)
        expect(readsAsSignedOut('')).toBe(false)
    })
})

describe('readsAsLostSession', () => {
    it('knows the two ways Colab says the runtime is gone', () => {
        expect(readsAsLostSession("[colab] Session 'place-moxir' not found.")).toBe(true)
        expect(readsAsLostSession('no such session')).toBe(true)
    })

    it('is not tripped by ordinary progress', () => {
        expect(readsAsLostSession('PLACE_STATUS {"state": "running", "elapsed": 412}')).toBe(false)
    })

    it('gives the job a few wedged polls before giving up', () => {
        expect(SILENT_POLLS_BEFORE_GIVING_UP).toBeGreaterThan(1)
    })
})

describe('parseStatusLines', () => {
    it('takes the last status the box printed, ignoring everything else', () => {
        const out = [
            'some warning from a library',
            'PLACE_STATUS {"state": "started", "images": 67}',
            'PLACE_STATUS {"state": "running", "elapsed": 90}'
        ].join('\n')
        const lines = parseStatusLines(out)
        expect(lines).toHaveLength(2)
        expect(lines.pop().state).toBe('running')
    })

    it('survives a half-written line rather than throwing', () => {
        expect(parseStatusLines('PLACE_STATUS {"state": "run')).toEqual([])
        expect(parseStatusLines('')).toEqual([])
    })
})

describe('planChunks', () => {
    it('splits a hall of photographs into pieces the upload can carry', () => {
        expect(planChunks(98 * 1024 * 1024)).toBe(7)
        expect(planChunks(1024)).toBe(1)
        expect(planChunks(CHUNK_BYTES)).toBe(1)
        expect(planChunks(CHUNK_BYTES + 1)).toBe(2)
    })
})

describe('findMeshroomResult', () => {
    it('finds the textured mesh wherever Meshroom buried it', () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'place-mr-'))
        const deep = path.join(root, 'Texturing', 'abc123')
        fs.mkdirSync(deep, { recursive: true })
        fs.writeFileSync(path.join(deep, 'texturedMesh.obj'), '')
        fs.writeFileSync(path.join(deep, 'texture_1001.png'), '')
        expect(findMeshroomResult(root)).toBe(path.join(deep, 'texturedMesh.obj'))
        fs.rmSync(root, { recursive: true, force: true })
    })

    it('answers null for an empty or missing folder', () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'place-mr-'))
        expect(findMeshroomResult(root)).toBeNull()
        expect(findMeshroomResult(path.join(root, 'nope'))).toBeNull()
        fs.rmSync(root, { recursive: true, force: true })
    })
})
