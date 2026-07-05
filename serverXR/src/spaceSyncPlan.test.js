// @vitest-environment node

import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const { matchGlobs, planSync, rewriteAssetUrl, mimeFor } = require('./spaceSyncPlan.js')

const REPO = [
  'index.html',
  'style.css',
  'src/app.js',
  'src/deep/util.mjs',
  'assets/video.mp4',
  'assets/img/photo.jpg',
  'assets/unreferenced.png',
  'README.md',
  'tool.py'
]

describe('matchGlobs', () => {
  it('matches * within a segment only', () => {
    expect(matchGlobs(REPO, ['*.css'])).toEqual(['style.css'])
    expect(matchGlobs(REPO, ['src/*.js'])).toEqual(['src/app.js'])
    expect(matchGlobs(REPO, ['*.js'])).toEqual([])
  })

  it('matches ** across segments', () => {
    expect(matchGlobs(REPO, ['assets/**'])).toEqual([
      'assets/video.mp4', 'assets/img/photo.jpg', 'assets/unreferenced.png'
    ])
    expect(matchGlobs(REPO, ['**/*.mjs'])).toEqual(['src/deep/util.mjs'])
  })

  it('returns nothing for missing/empty patterns', () => {
    expect(matchGlobs(REPO, undefined)).toEqual([])
    expect(matchGlobs(REPO, [])).toEqual([])
  })
})

describe('planSync', () => {
  const manifest = { include: ['*.css', 'src/**', '*.py'], assets: ['assets/**'] }
  const entryHtml = '<video src="assets/video.mp4"></video><img src="photo.jpg">'

  it('selects include-glob code files, excluding the entry and non-code extensions', () => {
    const { codePaths } = planSync({ manifest, repoPaths: REPO, entryPath: 'index.html', entryHtml })
    expect(codePaths).toEqual(['style.css', 'src/app.js', 'src/deep/util.mjs'])
  })

  it('selects only assets the entry references, by path or bare basename', () => {
    const { assetPaths } = planSync({ manifest, repoPaths: REPO, entryPath: 'index.html', entryHtml })
    expect(assetPaths).toEqual(['assets/video.mp4', 'assets/img/photo.jpg'])
  })

  it('excludes the entry even when an include glob matches it', () => {
    const { codePaths } = planSync({
      manifest: { include: ['*.html'] }, repoPaths: REPO, entryPath: 'index.html', entryHtml
    })
    expect(codePaths).toEqual([])
  })
})

describe('rewriteAssetUrl', () => {
  it('replaces both the repo-relative path and the bare basename', () => {
    const html = '<video src="assets/video.mp4"></video><a href="video.mp4">dl</a>'
    const out = rewriteAssetUrl(html, 'assets/video.mp4', '/serverXR/api/projects/p/assets/abc')
    expect(out).toBe('<video src="/serverXR/api/projects/p/assets/abc"></video><a href="/serverXR/api/projects/p/assets/abc">dl</a>')
  })
})

describe('mimeFor', () => {
  it('maps known extensions and falls back to octet-stream', () => {
    expect(mimeFor('assets/video.mp4')).toBe('video/mp4')
    expect(mimeFor('x/y.GLB'.toLowerCase())).toBe('model/gltf-binary')
    expect(mimeFor('mystery.bin')).toBe('application/octet-stream')
  })
})
