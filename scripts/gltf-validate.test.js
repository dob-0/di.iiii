// Every tracked .glb/.gltf must pass the Khronos glTF validator with 0 errors.
// Added 2026-11-10 after a global check found scan.glb with 2 ACCESSOR_TOTAL_OFFSET_ALIGNMENT errors.
// Warnings are not failures. Only binary .glb and self-contained .gltf are checked
// (external resources are resolved from disk next to the file).
import { describe, it, expect } from 'vitest'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import validator from 'gltf-validator'

const root = resolve(import.meta.dirname, '..')
const files = execFileSync('git', ['ls-files', '*.glb', '*.gltf'], { cwd: root, encoding: 'utf8' })
    .split('\n').filter(Boolean)

describe('tracked 3D files pass the Khronos glTF validator', () => {
    it('finds the tracked files', () => {
        expect(files.length).toBeGreaterThan(0)
    })
    it.each(files)('%s has 0 errors', async (file) => {
        const bytes = new Uint8Array(readFileSync(resolve(root, file)))
        const report = await validator.validateBytes(bytes, {
            uri: file,
            externalResourceFunction: (uri) => Promise.resolve(new Uint8Array(readFileSync(resolve(root, dirname(file), decodeURIComponent(uri)))))
        })
        const errors = report.issues.messages.filter((m) => m.severity === 0)
        expect(errors.map((m) => `${m.code} ${m.pointer}: ${m.message}`)).toEqual([])
    }, 60000)
})
