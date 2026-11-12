import { afterEach, describe, expect, it, vi } from 'vitest'
import { readLastProject, readLastProjectOf, rememberProject } from './lastProject.js'

afterEach(() => { window.sessionStorage.clear(); window.localStorage.clear(); vi.restoreAllMocks() })

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

    it('keeps each space\'s last project on this device, so a new tab still has it', () => {
        rememberProject('lab', 'show')
        rememberProject('gallery', 'wall')
        window.sessionStorage.clear() // a new tab: nothing of the old tab's memory
        expect(readLastProjectOf('lab')).toBe('show')
        expect(readLastProjectOf('gallery')).toBe('wall')
        expect(readLastProjectOf('other')).toBe(null)
        expect(readLastProjectOf(null)).toBe(null)
    })
    it('takes the newest project of a space, and leaves the tab memory for Tools and Wiki as it was', () => {
        rememberProject('lab', 'a')
        rememberProject('lab', 'b')
        expect(readLastProjectOf('lab')).toBe('b')
        expect(readLastProject()).toEqual({ space: 'lab', project: 'b' })
    })
    it('answers from the tab when the device memory is blocked, and only for the same space', () => {
        rememberProject('lab', 'show')
        const original = Storage.prototype.getItem
        vi.spyOn(Storage.prototype, 'getItem').mockImplementation(function (key) {
            if (this === window.localStorage) throw new Error('blocked')
            return original.call(this, key)
        })
        expect(readLastProjectOf('lab')).toBe('show')
        expect(readLastProjectOf('gallery')).toBe(null)
    })
    it('keeps at most 50 spaces, the oldest dropped, and survives a damaged value', () => {
        for (let i = 0; i < 55; i += 1) rememberProject(`s${i}`, 'p')
        expect(Object.keys(JSON.parse(window.localStorage.getItem('dii.lastProjectBySpace')))).toHaveLength(50)
        expect(readLastProjectOf('s0')).toBe(null)
        expect(readLastProjectOf('s54')).toBe('p')
        window.localStorage.setItem('dii.lastProjectBySpace', '[1,2')
        expect(readLastProjectOf('s54')).toBe(null)
        expect(() => rememberProject('s1', 'q')).not.toThrow()
        expect(readLastProjectOf('s1')).toBe('q')
    })
})
