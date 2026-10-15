import { describe, expect, it } from 'vitest'
import { buildStudioPreviewPath, buildStudioPreviewUrl } from './previewUrl.js'

// The Studio's Preview button opens the project's VIEW page (owner 2026-10-13). Same order as every
// other link in the product: the pretty /{space}/{slug} when the project has a handle, the permanent
// /{space}/p/{id} when it has none — never a link that cannot resolve.
describe('buildStudioPreviewPath', () => {
    it('is /{space}/{slug} when the project has a public handle', () => {
        expect(buildStudioPreviewPath({ spaceSlug: 'moxir', spaceId: 'moxir', projectSlug: 'v2-9', projectId: 'moxir-v2-9' })).toBe('/moxir/v2-9')
    })
    it('names the space by its slug when it has one, by its id when it has not', () => {
        expect(buildStudioPreviewPath({ spaceSlug: 'taron', spaceId: 'sp_1a2b', projectSlug: 'instruments', projectId: 'p1' })).toBe('/taron/instruments')
        expect(buildStudioPreviewPath({ spaceId: 'sp_1a2b', projectSlug: 'instruments', projectId: 'p1' })).toBe('/sp_1a2b/instruments')
    })
    it('falls back to the permanent /{space}/p/{id} when the project has no handle (or it is not known yet)', () => {
        expect(buildStudioPreviewPath({ spaceSlug: 'moxir', spaceId: 'moxir', projectSlug: null, projectId: 'moxir-v2-9' })).toBe('/moxir/p/moxir-v2-9')
        expect(buildStudioPreviewPath({ spaceId: 'moxir', projectId: 'moxir-v2-9' })).toBe('/moxir/p/moxir-v2-9')
    })
    it('is null while nothing is known, so no button is drawn for a link that cannot be built', () => {
        expect(buildStudioPreviewPath()).toBeNull()
        expect(buildStudioPreviewPath({ spaceId: 'moxir' })).toBeNull()
        expect(buildStudioPreviewPath({ projectId: 'moxir-v2-9' })).toBeNull()
        expect(buildStudioPreviewPath({ projectSlug: 'v2-9' })).toBeNull()
    })
})

describe('buildStudioPreviewUrl', () => {
    it('sits on the origin it is given, so a local install stays local and a dev tree stays on its tree', () => {
        const ids = { spaceSlug: 'moxir', spaceId: 'moxir', projectSlug: 'v2-9', projectId: 'moxir-v2-9' }
        expect(buildStudioPreviewUrl({ origin: 'http://diiii.localhost', ...ids })).toBe('http://diiii.localhost/moxir/v2-9?render=show')
        expect(buildStudioPreviewUrl({ origin: 'http://studio-nav-test.diiii.localhost', ...ids })).toBe('http://studio-nav-test.diiii.localhost/moxir/v2-9?render=show')
        expect(buildStudioPreviewUrl({ origin: 'https://dev.diiii.xyz', ...ids })).toBe('https://dev.diiii.xyz/moxir/v2-9?render=show')
    })
    it('defaults to the origin of the page the Studio runs on', () => {
        expect(buildStudioPreviewUrl({ spaceId: 'moxir', projectId: 'moxir-v2-9' })).toBe(`${window.location.origin}/moxir/p/moxir-v2-9?render=show`)
    })
    it('is null while nothing is known', () => {
        expect(buildStudioPreviewUrl({ origin: 'http://diiii.localhost' })).toBeNull()
    })
})
