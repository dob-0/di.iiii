import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// `npm ci` runs the package's install lifecycle scripts. In a Docker build only
// what was COPYed before that RUN exists, so every file those scripts name must
// be copied first. 2026-09-29: "prepare" gained scripts/install-git-hooks.mjs,
// the client image copied only package*.json before `npm ci`, and three dev
// deploys failed with "Cannot find module /app/scripts/install-git-hooks.mjs".
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const LIFECYCLE = ['preinstall', 'install', 'postinstall', 'prepare']

const cases = [
    { dockerfile: 'Dockerfile', packageJson: 'package.json' },
    { dockerfile: 'serverXR/Dockerfile', packageJson: 'serverXR/package.json' }
]

const filesNamedByInstallScripts = (pkgPath) => {
    const { scripts = {} } = JSON.parse(readFileSync(join(ROOT, pkgPath), 'utf8'))
    return LIFECYCLE.flatMap((name) => (scripts[name] || '').match(/[\w./-]+\.(?:mjs|cjs|js|sh)\b/g) || [])
}

const copiedBeforeFirstInstall = (dockerfilePath) => {
    const lines = readFileSync(join(ROOT, dockerfilePath), 'utf8').split('\n')
    const installAt = lines.findIndex((line) => /^\s*RUN\s+.*\bnpm (ci|install)\b/.test(line))
    return lines.slice(0, installAt < 0 ? lines.length : installAt)
        .filter((line) => /^\s*COPY\s/.test(line))
        .join('\n')
}

describe('Docker builds copy what npm install scripts need', () => {
    for (const { dockerfile, packageJson } of cases) {
        it(`${dockerfile}: every file ${packageJson}'s install scripts name is copied before npm ci`, () => {
            const copied = copiedBeforeFirstInstall(dockerfile)
            for (const file of filesNamedByInstallScripts(packageJson)) {
                expect(copied, `${file} is used by an install script but not copied before npm ci`).toContain(file)
            }
        })
    }
})
