#!/usr/bin/env node

import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { parseArgs } from 'node:util'

const { values } = parseArgs({
    options: {
        'deploy-env': { type: 'string' },
        'server-package': { type: 'string' }
    }
})

const deployEnv = String(values['deploy-env'] || process.env.DEPLOY_ENV || '').trim()
const packagePath = path.resolve(process.cwd(), values['server-package'] || 'serverXR/package.json')

if (!deployEnv) {
    throw new Error('Missing deploy environment. Pass --deploy-env <staging|production> or set DEPLOY_ENV.')
}

if (!['staging', 'production'].includes(deployEnv)) {
    console.log(`[cpanel:compat] Skipping check for deploy env "${deployEnv}".`)
    process.exit(0)
}

const forbiddenNativeDeps = [
    'better-sqlite3'
]

const packageJson = JSON.parse(await readFile(packagePath, 'utf8'))
const dependencies = {
    ...(packageJson.dependencies || {}),
    ...(packageJson.optionalDependencies || {})
}

const found = forbiddenNativeDeps.filter((dep) => typeof dependencies[dep] === 'string')

if (found.length > 0) {
    console.error('[cpanel:compat] cPanel prebuilt deploy is blocked due to incompatible native dependencies:')
    found.forEach((dep) => console.error(`  - ${dep}@${dependencies[dep]}`))
    console.error('[cpanel:compat] This host cannot reliably build/run these modules (glibc/python toolchain mismatch).')
    console.error('[cpanel:compat] Remove these dependencies from serverXR for cPanel branches, or migrate deploy target to Docker/VPS.')
    process.exit(1)
}

console.log(`[cpanel:compat] OK for ${deployEnv}. No blocked native dependencies found.`)