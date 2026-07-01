// @vitest-environment node

import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const { parseDriveUrl, resolveItems, filenameFromDisposition } = require('./googleDrive.js')

describe('parseDriveUrl', () => {
    it('reads a shared file link', () => {
        expect(parseDriveUrl('https://drive.google.com/file/d/1AbC_dEfGhIjKlM/view?usp=sharing'))
            .toEqual({ kind: 'file', id: '1AbC_dEfGhIjKlM' })
    })

    it('reads a shared folder link', () => {
        expect(parseDriveUrl('https://drive.google.com/drive/folders/1ZzYyXx_wWvVuUt'))
            .toEqual({ kind: 'folder', id: '1ZzYyXx_wWvVuUt' })
    })

    it('reads open?id= and docs links', () => {
        expect(parseDriveUrl('https://drive.google.com/open?id=1AbC_dEfGhIjKlM').id).toBe('1AbC_dEfGhIjKlM')
        expect(parseDriveUrl('https://docs.google.com/document/d/1DocIdXxxxxx/edit'))
            .toEqual({ kind: 'file', id: '1DocIdXxxxxx' })
    })

    it('accepts a bare id', () => {
        expect(parseDriveUrl('1AbC_dEfGhIjKlM')).toEqual({ kind: 'file', id: '1AbC_dEfGhIjKlM' })
    })

    it('rejects non-Drive input', () => {
        expect(parseDriveUrl('https://example.com/x')).toBeNull()
        expect(parseDriveUrl('')).toBeNull()
        expect(parseDriveUrl(null)).toBeNull()
    })
})

describe('resolveItems', () => {
    it('returns a bare file descriptor with no api key', async () => {
        const items = await resolveItems('https://drive.google.com/file/d/1AbC_dEfGhIjKlM/view')
        expect(items).toEqual([{ id: '1AbC_dEfGhIjKlM' }])
    })

    it('refuses folders without an api key', async () => {
        await expect(resolveItems('https://drive.google.com/drive/folders/1ZzYyXx_wWvVuUt'))
            .rejects.toThrow(/GOOGLE_API_KEY/)
    })

    it('rejects unrecognizable links', async () => {
        await expect(resolveItems('https://example.com/x')).rejects.toThrow(/Google Drive/)
    })
})

describe('filenameFromDisposition', () => {
    it('extracts plain and extended filenames', () => {
        expect(filenameFromDisposition('attachment; filename="bridge.glb"')).toBe('bridge.glb')
        expect(filenameFromDisposition("attachment; filename*=UTF-8''b%C3%A9zier.png")).toBe('bézier.png')
        expect(filenameFromDisposition('')).toBe('')
    })
})
