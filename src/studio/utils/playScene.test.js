import { beforeEach, describe, expect, it, vi } from 'vitest'

const read = vi.fn()
const load = vi.fn(async () => {})
const go = vi.fn(async () => {})
vi.mock('../../rigbuild/cueRun.js', () => ({ deskCues: { read: (...a) => read(...a), load: (...a) => load(...a), go: (...a) => go(...a) } }))

const { goDecision, playScene } = await import('./playScene.js')

const doc = {
    projectMeta: { id: 'proj-a' },
    mappingState: { cues: [{ id: 'c1', lightLook: 'look-1' }, { id: 'c2' }, { id: 'c3', lightLook: 'look-3' }] }
}

beforeEach(() => { read.mockReset(); load.mockClear(); go.mockClear() })

describe('goDecision: does GO load at once or ask first', () => {
    it('asks only when Light holds a non-empty cue list of ANOTHER project', () => {
        expect(goDecision({ project: 'proj-b', n: 3, running: true }, 'proj-a')).toBe('ask')
        expect(goDecision({ project: 'proj-b', n: 1, running: false }, 'proj-a')).toBe('ask')
    })
    it('goes when Light holds this project\'s list', () => {
        expect(goDecision({ project: 'proj-a', n: 3 }, 'proj-a')).toBe('go')
    })
    it('goes when Light holds nothing', () => {
        expect(goDecision({ project: '', n: 0 }, 'proj-a')).toBe('go')
        expect(goDecision({ project: 'proj-b', n: 0 }, 'proj-a')).toBe('go')
        expect(goDecision({}, 'proj-a')).toBe('go')
    })
    it('goes when Light did not answer or answered something unreadable', () => {
        expect(goDecision(null, 'proj-a')).toBe('go')
        expect(goDecision(undefined, 'proj-a')).toBe('go')
        expect(goDecision('x', 'proj-a')).toBe('go')
    })
})

describe('playScene', () => {
    it('another project\'s list: nothing is loaded, the answer is asked', async () => {
        read.mockResolvedValue({ project: 'proj-b', n: 4, running: true })
        expect(await playScene(doc, doc.mappingState.cues[0])).toEqual({ asked: true })
        expect(load).not.toHaveBeenCalled()
        expect(go).not.toHaveBeenCalled()
    })
    it('confirmed (replace): loads this list and goes to the cue\'s place among the cues with a look', async () => {
        read.mockResolvedValue({ project: 'proj-b', n: 4 })
        expect(await playScene(doc, doc.mappingState.cues[2], { replace: true })).toEqual({ asked: false })
        expect(read).not.toHaveBeenCalled()
        expect(load).toHaveBeenCalledWith('proj-a', doc.mappingState.cues, false, true)
        expect(go).toHaveBeenCalledWith(1)
    })
    it('this project\'s list, an empty Light, a null answer and a throw all go at once', async () => {
        for (const answer of [{ project: 'proj-a', n: 3 }, { project: '', n: 0 }, null]) {
            read.mockResolvedValueOnce(answer)
            load.mockClear(); go.mockClear()
            await playScene(doc, doc.mappingState.cues[0])
            expect(load).toHaveBeenCalledTimes(1)
            expect(go).toHaveBeenCalledWith(0)
        }
        read.mockRejectedValueOnce(new Error('no Light here'))
        load.mockClear(); go.mockClear()
        await playScene(doc, doc.mappingState.cues[0])
        expect(load).toHaveBeenCalledTimes(1)
        expect(go).toHaveBeenCalledTimes(1)
    })
    it('a cue with no light look still throws, in true words', async () => {
        await expect(playScene(doc, doc.mappingState.cues[1])).rejects.toThrow('this scene has no light look to go to')
    })
})
