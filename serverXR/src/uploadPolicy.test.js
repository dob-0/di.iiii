import { describe, expect, it } from 'vitest'
import { isAllowedUpload } from './uploadPolicy.js'

describe('upload policy', () => {
  // Laser File reads ILDA files (review of PR #1071, finding 2): without '.ild' here none could be uploaded.
  it('lets an ILDA file in, however the browser names its type', () => {
    for (const mimetype of ['application/octet-stream', '', 'application/x-ilda']) {
      expect(isAllowedUpload({ mimetype, originalname: 'Show.ILD' })).toBe(true)
    }
  })

  it('still refuses what it refused before', () => {
    expect(isAllowedUpload({ mimetype: 'application/octet-stream', originalname: 'run.exe' })).toBe(false)
    expect(isAllowedUpload({ mimetype: 'text/html', originalname: 'page.html' })).toBe(false)
    expect(isAllowedUpload({ mimetype: '', originalname: 'noext' })).toBe(false)
  })

  it('keeps the kinds it already took', () => {
    expect(isAllowedUpload({ mimetype: 'model/gltf-binary', originalname: 'a.glb' })).toBe(true)
    expect(isAllowedUpload({ mimetype: 'application/octet-stream', originalname: 'a.glb' })).toBe(true)
    expect(isAllowedUpload({ mimetype: '', originalname: 'drawing.svg' })).toBe(true)
  })
})
