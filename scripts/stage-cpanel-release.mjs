import { spawn } from 'node:child_process'
import {
    copyFile,
    cp,
    mkdir,
    access,
    readFile,
    rm,
    stat,
    writeFile
} from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '..')
const distRoot = path.join(repoRoot, 'dist')
const serverRoot = path.join(repoRoot, 'serverXR')
const sharedRoot = path.join(repoRoot, 'shared')
const templateRoot = path.join(repoRoot, 'deploy', 'cpanel')
const releaseRoot = path.join(repoRoot, '.deploy', 'cpanel')
const publicHtmlRoot = path.join(releaseRoot, 'public_html')
const releaseServerRoot = path.join(releaseRoot, 'serverXR')
const releaseSharedRoot = path.join(releaseRoot, 'shared')
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm'

const parseEnvFile = async (filePath) => {
    try {
        const raw = await readFile(filePath, 'utf8')
        return raw
            .split(/\r?\n/)
            .reduce((acc, line) => {
                const trimmed = line.trim()
                if (!trimmed || trimmed.startsWith('#')) return acc
                const separatorIndex = trimmed.indexOf('=')
                if (separatorIndex === -1) return acc
                const key = trimmed.slice(0, separatorIndex).trim()
                const value = trimmed.slice(separatorIndex + 1).trim().replace(/^['"]|['"]$/g, '')
                if (key) acc[key] = value
                return acc
            }, {})
    } catch {
        return {}
    }
}

const runCommand = (command, args, options = {}) => new Promise((resolve, reject) => {
    const child = spawn(command, args, {
        cwd: options.cwd || repoRoot,
        env: options.env || process.env,
        stdio: 'inherit'
    })
    child.on('exit', (code) => {
        if (code === 0) {
            resolve()
            return
        }
        reject(new Error(`${command} ${args.join(' ')} exited with code ${code ?? 'unknown'}`))
    })
})

const ensureDir = async (targetPath) => {
    await mkdir(targetPath, { recursive: true })
}

const copyIfPresent = async (sourcePath, targetPath) => {
    await ensureDir(path.dirname(targetPath))
    await copyFile(sourcePath, targetPath)
}

const copyDirectory = async (sourcePath, targetPath, filter = null) => {
    await cp(sourcePath, targetPath, {
        recursive: true,
        filter: filter || (() => true)
    })
}

const formatTimestamp = (date = new Date()) => {
    const pad = (value) => String(value).padStart(2, '0')
    return [
        date.getFullYear(),
        pad(date.getMonth() + 1),
        pad(date.getDate())
    ].join('') + '-' + [
        pad(date.getHours()),
        pad(date.getMinutes()),
        pad(date.getSeconds())
    ].join('')
}

const buildReleaseManifest = ({ timestamp }) => ({
    generatedAt: new Date().toISOString(),
    releaseId: `cpanel-${timestamp}`,
    paths: {
        publicHtml: 'public_html',
        serverXR: 'serverXR',
        shared: 'shared'
    },
    notes: [
        'Upload public_html contents to your web root.',
        'Upload serverXR and shared as sibling folders in your home directory.',
        'Copy serverXR/.env.production.example to serverXR/.env before first start.'
    ]
})

const buildReleaseEnv = async () => {
    const rootEnv = await parseEnvFile(path.join(repoRoot, '.env'))
    const env = { ...process.env }

    if (!env.VITE_API_BASE_URL && rootEnv.VITE_API_BASE_URL) {
        env.VITE_API_BASE_URL = rootEnv.VITE_API_BASE_URL
    }

    if (!env.VITE_API_TOKEN && rootEnv.VITE_API_TOKEN) {
        env.VITE_API_TOKEN = rootEnv.VITE_API_TOKEN
    }

    return env
}

const ensureRequiredPaths = async () => {
    await access(path.join(serverRoot, 'src'))
    await access(sharedRoot)
}

await ensureRequiredPaths()
const releaseEnv = await buildReleaseEnv()
await runCommand(npmCommand, ['run', 'build'], { cwd: repoRoot, env: releaseEnv })

try {
    await stat(distRoot)
} catch {
    throw new Error('dist/ was not created. The frontend build did not complete successfully.')
}

await rm(releaseRoot, { recursive: true, force: true })
await ensureDir(releaseRoot)

await copyDirectory(distRoot, publicHtmlRoot)

await ensureDir(releaseServerRoot)
await copyDirectory(path.join(serverRoot, 'src'), path.join(releaseServerRoot, 'src'), (sourcePath) => !sourcePath.endsWith('.test.js'))
await copyDirectory(path.join(serverRoot, 'public'), path.join(releaseServerRoot, 'public'))
await copyIfPresent(path.join(serverRoot, 'package.json'), path.join(releaseServerRoot, 'package.json'))
await copyIfPresent(path.join(serverRoot, 'package-lock.json'), path.join(releaseServerRoot, 'package-lock.json'))
await copyIfPresent(path.join(serverRoot, 'ecosystem.config.js'), path.join(releaseServerRoot, 'ecosystem.config.js'))
await copyIfPresent(path.join(serverRoot, 'README.md'), path.join(releaseServerRoot, 'README.md'))
await copyIfPresent(path.join(templateRoot, 'serverXR.env.production.example'), path.join(releaseServerRoot, '.env.production.example'))

await ensureDir(releaseSharedRoot)
await copyDirectory(sharedRoot, releaseSharedRoot, (sourcePath) => sourcePath.endsWith('.cjs') || !path.extname(sourcePath))

await copyIfPresent(path.join(templateRoot, 'frontend.env.production.example'), path.join(releaseRoot, 'frontend.env.production.example'))
await copyIfPresent(path.join(templateRoot, 'DEPLOY.md'), path.join(releaseRoot, 'DEPLOY.md'))

const releaseManifest = buildReleaseManifest({ timestamp: formatTimestamp() })
await writeFile(path.join(releaseRoot, 'release.json'), `${JSON.stringify(releaseManifest, null, 2)}\n`, 'utf8')

const frontendEnvExample = await readFile(path.join(templateRoot, 'frontend.env.production.example'), 'utf8')
const serverEnvExample = await readFile(path.join(templateRoot, 'serverXR.env.production.example'), 'utf8')

console.log('')
console.log('[deploy:cpanel] Release staged successfully.')
console.log(`[deploy:cpanel] Output: ${releaseRoot}`)
console.log(`[deploy:cpanel] Frontend env template: ${path.join(releaseRoot, 'frontend.env.production.example')}`)
console.log(`[deploy:cpanel] Server env template: ${path.join(releaseServerRoot, '.env.production.example')}`)
console.log('')
console.log('[deploy:cpanel] frontend.env.production.example')
console.log(frontendEnvExample.trim())
console.log('')
console.log('[deploy:cpanel] serverXR/.env.production.example')
console.log(serverEnvExample.trim())
