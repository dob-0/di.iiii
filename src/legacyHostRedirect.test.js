// di-studio.xyz answered 200 with a duplicate of every page. nginx.conf
// now 301s page requests to diiii.xyz, but never the /serverXR/ API (OAuth
// callbacks, asset URLs saved in old data). The map's regex is read from the
// file and run here (PCRE and JS agree on this lookahead + named group).
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import process from 'node:process'

const conf = readFileSync(resolve(process.cwd(), 'nginx.conf'), 'utf8')
const m = conf.match(/map "\$host\$request_uri" \$dii_legacy_path \{[\s\S]*?"~\*(.+?)" \$dii_legacy_rest;/)

const target = (hostAndUri) => {
  const hit = new RegExp(m[1], 'i').exec(hostAndUri)
  return hit ? `https://diiii.xyz${hit.groups.dii_legacy_rest}` : ''
}

describe('legacy host redirect (nginx.conf)', () => {
  it('has the map and the 301', () => {
    expect(m).toBeTruthy()
    expect(conf).toMatch(/if \(\$dii_legacy_path\) \{\s*return 301 https:\/\/diiii\.xyz\$dii_legacy_path;/)
  })
  it('sends pages and robots/sitemap to the same path on diiii.xyz', () => {
    expect(target('di-studio.xyz/')).toBe('https://diiii.xyz/')
    expect(target('di-studio.xyz/dilijan?x=1')).toBe('https://diiii.xyz/dilijan?x=1')
    expect(target('www.di-studio.xyz/robots.txt')).toBe('https://diiii.xyz/robots.txt')
    expect(target('DI-STUDIO.XYZ/sitemap.xml')).toBe('https://diiii.xyz/sitemap.xml')
  })
  it('leaves the API and other hosts alone', () => {
    expect(target('di-studio.xyz/serverXR/api/auth/github')).toBe('')
    expect(target('diiii.xyz/')).toBe('')
    expect(target('dev.diiii.xyz/')).toBe('')
    expect(target('evil-di-studio.xyz/')).toBe('')
    expect(target('di-studio.xyz/serverXR')).toBe('')
    expect(target('di-studio.xyz/serverXR?probe=1')).toBe('')
  })
  it('never redirects the install script paths (curl | sh does not follow a 301)', () => {
    for (const p of ['/get', '/get.sh', '/get.ps1', '/get?v=1', '/GET.SH']) expect(target('di-studio.xyz' + p)).toBe('')
    expect(target('di-studio.xyz/getting-started')).toBe('https://diiii.xyz/getting-started')
  })
})
