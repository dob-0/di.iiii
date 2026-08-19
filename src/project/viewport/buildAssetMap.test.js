import { describe, expect, it, vi } from 'vitest'

vi.mock(import('../../services/apiClient.js'), async (importOriginal) => {
    const actual = await importOriginal()
    return { ...actual, apiBaseUrl: '/serverXR' }
})

import { buildAssetMap } from './buildAssetMap.js'

describe('buildAssetMap', () => {
    it('remounts stored relative /api urls onto the API base (blank prod images bug)', () => {
        const map = buildAssetMap({
            projectMeta: { id: 'main-dii-project' },
            assets: [{ id: 'a1', url: '/api/projects/main-dii-project/assets/a1' }]
        })
        expect(map.get('a1').url).toBe('/serverXR/api/projects/main-dii-project/assets/a1')
    })

    it('leaves absolute urls alone', () => {
        const map = buildAssetMap({
            projectMeta: { id: 'p' },
            assets: [{ id: 'a1', url: 'https://cdn.example.com/a1.png' }]
        })
        expect(map.get('a1').url).toBe('https://cdn.example.com/a1.png')
    })

    it('falls back to the project asset endpoint when no url is stored', () => {
        const map = buildAssetMap({
            projectMeta: { id: 'p' },
            assets: [{ id: 'a1' }]
        })
        expect(map.get('a1').url).toBe('/serverXR/api/projects/p/assets/a1')
    })

    it('uses the fallback project id when projectMeta is absent', () => {
        const map = buildAssetMap({ assets: [{ id: 'a1' }] }, 'fallback-p')
        expect(map.get('a1').url).toBe('/serverXR/api/projects/fallback-p/assets/a1')
    })
})
