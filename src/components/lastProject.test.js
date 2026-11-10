import { afterEach, describe, expect, it, vi } from 'vitest'
import { readLastProject, rememberProject } from './lastProject.js'

afterEach(() => { window.sessionStorage.clear(); vi.restoreAllMocks() })

describe('last project', () => {
    it('remembers the space and project, and reads them back', () => {
        expect(readLastProject()).toEqual({ space: null, project: null })
        rememberProject('lab', 'show')
        expect(readLastProject()).toEqual({ space: 'lab', project: 'show' })
    })
    it('ignores a missing project and survives blocked storage', () => {
        rememberProject('lab', null)
        expect(readLastProject().project).toBe(null)
        vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked') })
        vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked') })
        expect(() => rememberProject('lab', 'show')).not.toThrow()
        expect(readLastProject()).toEqual({ space: null, project: null })
    })
})
