'use strict'
// Reads the Electron fuses of a built app with `@electron/fuses read` and exits
// 1 if any differs from package.json "build.electronFuses" (the one place that
// sets them). Run after a build, in CI too:
//   node scripts/check-fuses.js dist/linux-unpacked/di-desktop
const { execFileSync } = require('node:child_process')
const path = require('node:path')
const { build } = require('../package.json')

// electron-builder option name -> the name `fuses read` prints.
const NAMES = {
    runAsNode: 'RunAsNode',
    enableCookieEncryption: 'EnableCookieEncryption',
    enableNodeOptionsEnvironmentVariable: 'EnableNodeOptionsEnvironmentVariable',
    enableNodeCliInspectArguments: 'EnableNodeCliInspectArguments',
    enableEmbeddedAsarIntegrityValidation: 'EnableEmbeddedAsarIntegrityValidation',
    onlyLoadAppFromAsar: 'OnlyLoadAppFromAsar',
    grantFileProtocolExtraPrivileges: 'GrantFileProtocolExtraPrivileges'
}

const apps = process.argv.slice(2)
if (!apps.length) {
    process.stderr.write('usage: node scripts/check-fuses.js <app binary or .app> [...]\n')
    process.exit(2)
}
const bin = path.join(path.dirname(require.resolve('@electron/fuses/package.json')), 'dist', 'bin.js')
let bad = 0
for (const app of apps) {
    const out = execFileSync(process.execPath, [bin, 'read', '--app', app], { encoding: 'utf8' })
    process.stdout.write(out)
    for (const [key, name] of Object.entries(NAMES)) {
        const want = build.electronFuses[key] ? 'Enabled' : 'Disabled'
        const line = out.split('\n').find((l) => l.trim().startsWith(`${name} is `))
        const got = line ? line.trim().split(' is ')[1] : 'missing'
        if (got !== want) {
            process.stderr.write(`FUSE MISMATCH in ${app}: ${name} is ${got}, expected ${want}\n`)
            bad += 1
        }
    }
}
process.exit(bad ? 1 : 0)
