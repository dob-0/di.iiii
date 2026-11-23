// @vitest-environment node
//
// nginx-conf.sh turns the repo's REAL nginx.conf (the client image's server block) into a standby
// host's. 2026-10-29: it rewrote listen, root and server:4000 but not the alias of
// /sitemap-built.xml, so on the Mac that address answered 404 (open() "/usr/share/nginx/html/
// sitemap.xml" failed, the dev nginx error log). These run the script as release.sh does, with a
// stand-in nginx binary that accepts `-t`; the real `nginx -t` runs in the rehearsal on r-di.

import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const SCRIPT = path.join(ROOT_DIR, 'scripts', 'standby', 'nginx-conf.sh')
const NGINX_CONF = path.join(ROOT_DIR, 'nginx.conf')

const dirs = []
afterEach(() => { while (dirs.length) fs.rmSync(dirs.pop(), { recursive: true, force: true }) })

// a release dir as build-runtime.sh leaves it (nginx.conf.prod + dist/), and a stand-in nginx
const setup = (conf = fs.readFileSync(NGINX_CONF, 'utf8')) => {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), 'nginx-conf-')); dirs.push(d)
    const rel = path.join(d, 'rel')
    fs.mkdirSync(path.join(rel, 'dist'), { recursive: true })
    fs.writeFileSync(path.join(rel, 'nginx.conf.prod'), conf)
    fs.mkdirSync(path.join(d, 'bin'))
    const nginx = path.join(d, 'bin', 'nginx')
    fs.writeFileSync(nginx, '#!/bin/sh\nexit 0\n', { mode: 0o755 })
    const run = () => spawnSync('bash', [SCRIPT, nginx, rel, '127.0.0.1:8081', '127.0.0.1:4001', path.join(d, 'run'), path.join(d, 'out', 'nginx.conf')], { encoding: 'utf8' })
    return { rel, run, block: () => fs.readFileSync(path.join(d, 'out', 'server.conf'), 'utf8') }
}

describe('nginx-conf.sh', () => {
    it('leaves no root or alias under /usr/share/nginx/html; /sitemap-built.xml reads the release', () => {
        const { rel, run, block } = setup()
        const r = run()
        expect(r.stderr).toBe('')
        expect(r.status).toBe(0)
        const out = block()
        expect(out).not.toMatch(/^[^#]*\/usr\/share\/nginx\/html/m)
        expect(out).toContain(`alias ${rel}/dist/sitemap.xml;`)
        expect(out).toContain(`root ${rel}/dist;`)
        expect(out).toMatch(/^\s*listen 127\.0\.0\.1:8081;/m)
        expect(out).not.toContain('http://server:4000')
    })

    it('still stops when prod\'s nginx.conf loses one of the three lines it rewrites', () => {
        const conf = fs.readFileSync(NGINX_CONF, 'utf8')
        for (const gone of [/^\s*listen 8080;$/m, /^\s*root \/usr\/share\/nginx\/html;$/m, /http:\/\/server:4000/g]) {
            const r = setup(conf.replace(gone, '')).run()
            expect(r.status).toBe(1)
            expect(r.stderr).toContain('no longer contains')
        }
    })

    it('stops when a new line names /usr/share/nginx/html in a form it does not rewrite', () => {
        const conf = fs.readFileSync(NGINX_CONF, 'utf8').replace('location = /sitemap-built.xml {', 'location = /x { try_files /usr/share/nginx/html/x =404; }\n    location = /sitemap-built.xml {')
        const r = setup(conf).run()
        expect(r.status).toBe(1)
        expect(r.stderr).toContain('still names /usr/share/nginx/html')
    })
})
