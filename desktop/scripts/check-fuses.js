'use strict'
// Reads the Electron fuses of a built app with `@electron/fuses read` and exits
// 1 if any differs from package.json "build.electronFuses" (the one place that
// sets them). A fuse that is not set there, or that the built app does not
// report, is a mismatch too (never "assume Disabled"). Run after a build, in CI
// too:
//   node scripts/check-fuses.js dist/linux-unpacked/di-desktop
const { execFileSync } = require('node:child_process')
const path = require('node:path')

// electron-builder option name -> the name `fuses read` prints.
const NAMES = Object.freeze({
    runAsNode: 'RunAsNode',
    enableCookieEncryption: 'EnableCookieEncryption',
    enableNodeOptionsEnvironmentVariable: 'EnableNodeOptionsEnvironmentVariable',
    enableNodeCliInspectArguments: 'EnableNodeCliInspectArguments',
    enableEmbeddedAsarIntegrityValidation: 'EnableEmbeddedAsarIntegrityValidation',
    onlyLoadAppFromAsar: 'OnlyLoadAppFromAsar',
    grantFileProtocolExtraPrivileges: 'GrantFileProtocolExtraPrivileges'
})

// `out` is the text of `fuses read`, `config` is build.electronFuses.
// Returns one message per problem; an empty list is a pass.
const compare = (out, config, app = 'app') => {
    const problems = []
    for (const [key, name] of Object.entries(NAMES)) {
        const set = config ? config[key] : undefined
        if (typeof set !== 'boolean') {
            problems.push(`FUSE MISMATCH in ${app}: ${name} is not set (true or false) in package.json build.electronFuses`)
            continue
        }
        const want = set ? 'Enabled' : 'Disabled'
        const line = String(out).split('\n').find((l) => l.trim().startsWith(`${name} is `))
        const got = line ? line.trim().split(' is ')[1].trim() : 'missing'
        if (got !== want) problems.push(`FUSE MISMATCH in ${app}: ${name} is ${got}, expected ${want}`)
    }
    return problems
}

const main = () => {
    const { build } = require('../package.json')
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
        for (const problem of compare(out, build.electronFuses, app)) {
            process.stderr.write(`${problem}\n`)
            bad += 1
        }
    }
    process.exit(bad ? 1 : 0)
}

if (require.main === module) main()

module.exports = { NAMES, compare }
