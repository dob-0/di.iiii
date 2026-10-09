// @vitest-environment node
import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const { resolveAssetResponseType, applyAssetSafetyHeaders } = require('./assetResponseType.js')

const fakeRes = () => {
  const headers = {}
  return {
    headers,
    setHeader: (k, v) => { headers[k.toLowerCase()] = v },
    removeHeader: (k) => { delete headers[k.toLowerCase()] }
  }
}

describe('resolveAssetResponseType', () => {
  it.each([
    ['image/png'], ['image/jpeg'], ['image/webp'], ['image/gif'], ['image/avif'],
    ['video/mp4'], ['video/webm'], ['video/quicktime'],
    ['audio/mpeg'], ['audio/wav'], ['audio/ogg'],
    ['model/gltf-binary'], ['model/gltf+json'], ['model/obj'], ['model/stl'],
    ['text/plain'], ['application/json']
  ])('%s is passive media: its own type, inline', (mime) => {
    expect(resolveAssetResponseType(mime, 'x')).toEqual({ contentType: mime, disposition: 'inline' })
  })

  it.each([['image/svg+xml'], ['application/pdf'], ['application/zip']])('%s keeps its type but downloads', (mime) => {
    expect(resolveAssetResponseType(mime, 'x')).toEqual({ contentType: mime, disposition: 'attachment' })
  })

  it.each([
    ['text/html'], ['application/xhtml+xml'], ['text/xml'], ['application/xml'],
    ['image/x-note+xml'], ['model/x3d+xml'], ['video/x-cue+xml'], ['audio/x-thing+xml'],
    ['image/svg+xml-compressed'], ['text/javascript'], ['application/javascript'],
    ['text/css'], ['application/x-shockwave-flash'], ['multipart/x-mixed-replace'],
    ['image/made-up'], ['video/made-up'], ['nonsense']
  ])('%s is off the list: octet-stream download', (mime) => {
    expect(resolveAssetResponseType(mime, 'page.html')).toEqual({ contentType: 'application/octet-stream', disposition: 'attachment' })
  })

  it('reads parameters and case off the declared type', () => {
    expect(resolveAssetResponseType('IMAGE/PNG; charset=utf-8', 'a.png').contentType).toBe('image/png')
    expect(resolveAssetResponseType('text/html; charset=utf-8', 'a.png').contentType).toBe('application/octet-stream')
  })

  it('uses the name only for a generic declared type, and only to a listed type', () => {
    expect(resolveAssetResponseType('application/octet-stream', 'Chair.GLB')).toEqual({ contentType: 'model/gltf-binary', disposition: 'inline' })
    expect(resolveAssetResponseType('', 'room.hdr')).toEqual({ contentType: 'image/vnd.radiance', disposition: 'inline' })
    expect(resolveAssetResponseType(undefined, 'mark.svg')).toEqual({ contentType: 'image/svg+xml', disposition: 'attachment' })
    expect(resolveAssetResponseType('application/octet-stream', 'page.html')).toEqual({ contentType: 'application/octet-stream', disposition: 'attachment' })
    expect(resolveAssetResponseType('application/octet-stream', 'mesh.fbx')).toEqual({ contentType: 'application/octet-stream', disposition: 'attachment' })
    // a specific declared type is never widened by the name
    expect(resolveAssetResponseType('text/html', 'looks-like.png').contentType).toBe('application/octet-stream')
  })
})

describe('applyAssetSafetyHeaders', () => {
  it('always sets nosniff and a sandbox CSP, and overwrites an earlier Content-Type', () => {
    const res = fakeRes()
    res.setHeader('Content-Type', 'text/html')
    res.setHeader('Content-Disposition', 'inline')
    applyAssetSafetyHeaders(res, 'image/png', 'a.png')
    expect(res.headers).toEqual({
      'content-type': 'image/png',
      'x-content-type-options': 'nosniff',
      'content-security-policy': 'sandbox'
    })
  })

  it('marks off-list types as an attachment', () => {
    const res = fakeRes()
    applyAssetSafetyHeaders(res, 'image/x-note+xml', 'n.xml')
    expect(res.headers['content-type']).toBe('application/octet-stream')
    expect(res.headers['content-disposition']).toBe('attachment')
    expect(res.headers['content-security-policy']).toBe('sandbox')
  })
})
