import { afterEach, describe, expect, it } from 'vitest'
import { stashRawEnterNode, peekRawEnterNode, clearRawEnterNode } from './rawEnterNodeHandoff.js'

afterEach(() => clearRawEnterNode())

describe('rawEnterNodeHandoff', () => {
    it('stashRawEnterNode(nodeId) lands in any project', () => {
        stashRawEnterNode('deck1')
        expect(peekRawEnterNode('p1')).toBe('deck1')
        expect(peekRawEnterNode('p2')).toBe('deck1')
    })
    it('stashRawEnterNode(projectId, nodeId) stays bound to its project', () => {
        stashRawEnterNode('p1', 'deck1')
        expect(peekRawEnterNode('p1')).toBe('deck1')
        expect(peekRawEnterNode('p2')).toBeNull()
    })
    it('clear removes it; empty id stashes nothing', () => {
        stashRawEnterNode('')
        expect(peekRawEnterNode('p1')).toBeNull()
        stashRawEnterNode('deck1')
        clearRawEnterNode()
        expect(peekRawEnterNode('p1')).toBeNull()
    })
})
