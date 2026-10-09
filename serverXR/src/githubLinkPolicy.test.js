// @vitest-environment node
import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const { parseAllowedRepos, isRepoOnList, isValidEntry, isValidRef, checkLinkRequest } = require('./githubLinkPolicy.js')

describe('githubLinkPolicy', () => {
  it('parses the operator list: owner/repo and owner/*, any case, comma or space separated', () => {
    expect(parseAllowedRepos(' Studio-Org/Site,open-org/*  other/x ')).toEqual([
      { owner: 'studio-org', repo: 'site' },
      { owner: 'open-org', repo: '*' },
      { owner: 'other', repo: 'x' }
    ])
    expect(parseAllowedRepos('')).toEqual([])
    expect(parseAllowedRepos(undefined)).toEqual([])
    // malformed entries are dropped, never widened
    expect(parseAllowedRepos('*, */*, a/b/c, owner, ../x, a/..')).toEqual([])
  })

  it('matches repos against the list', () => {
    const list = parseAllowedRepos('studio-org/site, open-org/*')
    expect(isRepoOnList('Studio-Org', 'SITE', list)).toBe(true)
    expect(isRepoOnList('studio-org', 'other', list)).toBe(false)
    expect(isRepoOnList('open-org', 'anything', list)).toBe(true)
    expect(isRepoOnList('someone', 'site', list)).toBe(false)
    expect(isRepoOnList('someone', 'site', [])).toBe(false)
  })

  it.each([
    ['index.html', true], ['docs/page.htm', true], ['./site/index.html', true],
    ['config/.env', false], ['../secrets.html', false], ['a/../b.html', false], ['/abs/index.html', false],
    ['a//b.html', false], ['index.js', false], ['a\\b.html', false], ['', false], [null, false]
  ])('entry %s → %s', (entry, ok) => {
    expect(isValidEntry(entry)).toBe(ok)
  })

  it.each([
    [null, true], ['', true], ['main', true], ['feature/x-1', true], ['v1.2.3', true],
    ['../main', false], ['a b', false], ['main?x=1', false], ['a//b', false]
  ])('ref %s → %s', (ref, ok) => {
    expect(isValidRef(ref)).toBe(ok)
  })

  it('refuses an unlisted repo to a non-admin with 403, before anything else', () => {
    const allowedRepos = parseAllowedRepos('studio-org/site')
    expect(checkLinkRequest({ owner: 'someone', repo: 'private', entry: 'config/.env' }, { isAdmin: false, allowedRepos }))
      .toMatchObject({ ok: false, status: 403 })
    expect(checkLinkRequest({ owner: 'studio-org', repo: 'site', entry: 'index.html' }, { isAdmin: false, allowedRepos }))
      .toEqual({ ok: true })
  })

  it('lets an admin link any repo, still with a valid entry', () => {
    expect(checkLinkRequest({ owner: 'someone', repo: 'private', entry: 'index.html' }, { isAdmin: true, allowedRepos: [] }))
      .toEqual({ ok: true })
    expect(checkLinkRequest({ owner: 'someone', repo: 'private', entry: 'config/.env' }, { isAdmin: true, allowedRepos: [] }))
      .toMatchObject({ ok: false, status: 400 })
    expect(checkLinkRequest({ owner: 'bad owner', repo: 'r', entry: 'index.html' }, { isAdmin: true, allowedRepos: [] }))
      .toMatchObject({ ok: false, status: 400 })
  })
})
