import { spawn } from 'node:child_process'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { parseArgs } from 'node:util'

const { values } = parseArgs({
    options: {
        'base-url': {
            type: 'string'
        },
        output: {
            type: 'string'
        },
        timeout: {
            type: 'string'
        }
    }
})

const baseUrl = String(values['base-url'] || process.env.SMOKE_BASE_URL || '').trim().replace(/\/+$/, '')

if (!baseUrl) {
    throw new Error('Missing required --base-url value.')
}

const timeoutMs = Math.max(1000, Number(values.timeout || process.env.SMOKE_TIMEOUT_MS || 10000) || 10000)
const outputPath = values.output ? path.resolve(process.cwd(), values.output) : ''
const timeoutSeconds = Math.max(2, Math.ceil(timeoutMs / 1000))

const buildUrl = (suffix) => new URL(suffix, `${baseUrl}/`).toString()

const checks = [
    {
        name: 'frontend root',
        path: '/',
        expectedStatuses: [200],
        contentTypeIncludes: 'text/html',
        bodyIncludes: ['<div id="root"></div>']
    },
    {
        name: 'main public route',
        path: '/main',
        expectedStatuses: [200],
        contentTypeIncludes: 'text/html',
        bodyIncludes: ['<div id="root"></div>']
    },
    {
        name: 'admin route',
        path: '/admin?space=main',
        expectedStatuses: [200],
        contentTypeIncludes: 'text/html',
        bodyIncludes: ['<div id="root"></div>']
    },
    {
        name: 'studio route',
        path: '/main/studio',
        expectedStatuses: [200],
        contentTypeIncludes: 'text/html',
        bodyIncludes: ['<div id="root"></div>']
    },
    {
        name: 'beta route',
        path: '/main/beta',
        expectedStatuses: [200],
        contentTypeIncludes: 'text/html',
        bodyIncludes: ['<div id="root"></div>']
    },
    {
        name: 'server health',
        path: '/serverXR/api/health',
        expectedStatuses: [200],
        contentTypeIncludes: 'application/json',
        bodyIncludes: ['"release"']
    },
    {
        name: 'server events',
        path: '/serverXR/api/events',
        expectedStatuses: [200],
        contentTypeIncludes: 'application/json'
    },
    {
        name: 'server monitor',
        path: '/serverXR/',
        expectedStatuses: [200],
        contentTypeIncludes: 'text/html',
        bodyExcludes: ['Index of /serverXR/']
    },
    {
        name: 'asset route proxy',
        path: '/serverXR/api/spaces/main/assets/not-a-real-asset',
        expectedStatuses: [400, 404],
        contentTypeExcludes: ['text/html'],
        bodyExcludes: ['Index of /serverXR/', '503 Service Unavailable']
    }
]

const captureCurlResponse = async (url) => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), 'dii-smoke-'))
    const headersPath = path.join(tempDir, 'headers.txt')
    const bodyPath = path.join(tempDir, 'body.txt')

    try {
        const result = await new Promise((resolve) => {
            const child = spawn('curl', [
                '-sS',
                '-L',
                '--connect-timeout',
                String(timeoutSeconds),
                '--max-time',
                String(timeoutSeconds),
                '-H',
                'Accept: application/json,text/html;q=0.9,*/*;q=0.8',
                '-D',
                headersPath,
                '-o',
                bodyPath,
                url
            ], {
                stdio: ['ignore', 'ignore', 'pipe']
            })

            let stderr = ''
            child.stderr?.on('data', (chunk) => {
                stderr += chunk.toString()
            })
            child.on('error', (error) => {
                resolve({ code: 1, stderr: error.message || String(error) })
            })
            child.on('exit', (code) => {
                resolve({ code: code ?? 1, stderr: stderr.trim() })
            })
        })

        if (result.code !== 0) {
            throw new Error(result.stderr || `curl exited with code ${result.code}`)
        }

        const [rawHeaders, body] = await Promise.all([
            readFile(headersPath, 'utf8'),
            readFile(bodyPath, 'utf8')
        ])

        const headerBlocks = rawHeaders
            .split(/\r?\n\r?\n/)
            .map((entry) => entry.trim())
            .filter(Boolean)
        const finalHeaders = headerBlocks.at(-1) || ''
        const statusLine = finalHeaders.split(/\r?\n/)[0] || ''
        const statusMatch = statusLine.match(/HTTP\/[0-9.]+\s+(\d{3})/)
        const contentTypeMatch = finalHeaders.match(/^content-type:\s*(.+)$/im)

        return {
            status: statusMatch ? Number(statusMatch[1]) : 0,
            contentType: contentTypeMatch ? contentTypeMatch[1].trim() : '',
            body
        }
    } finally {
        await rm(tempDir, { recursive: true, force: true })
    }
}

const runCheck = async (check) => {
    const url = buildUrl(check.path)
    const response = await captureCurlResponse(url)
    const body = response.body
    const contentType = response.contentType || ''
    const issues = []

    if (!check.expectedStatuses.includes(response.status)) {
        issues.push(`expected status ${check.expectedStatuses.join(' or ')}, received ${response.status}`)
    }
    if (check.contentTypeIncludes && !contentType.includes(check.contentTypeIncludes)) {
        issues.push(`expected content-type containing "${check.contentTypeIncludes}", received "${contentType || 'unknown'}"`)
    }
    ;(check.contentTypeExcludes || []).forEach((value) => {
        if (contentType.includes(value)) {
            issues.push(`did not expect content-type containing "${value}"`)
        }
    })
    ;(check.bodyIncludes || []).forEach((value) => {
        if (!body.includes(value)) {
            issues.push(`response body did not include "${value}"`)
        }
    })
    ;(check.bodyExcludes || []).forEach((value) => {
        if (body.includes(value)) {
            issues.push(`response body unexpectedly included "${value}"`)
        }
    })

    return {
        name: check.name,
        url,
        status: response.status,
        ok: issues.length === 0,
        contentType,
        issues
    }
}

const results = []

for (const check of checks) {
    try {
        const result = await runCheck(check)
        results.push(result)
    } catch (error) {
        results.push({
            name: check.name,
            url: buildUrl(check.path),
            status: null,
            ok: false,
            contentType: '',
            issues: [error.cause?.message || error.message || String(error)]
        })
    }
}

const summary = {
    checkedAt: new Date().toISOString(),
    baseUrl,
    success: results.every((entry) => entry.ok),
    checks: results
}

results.forEach((entry) => {
    const prefix = entry.ok ? 'PASS' : 'FAIL'
    console.log(`[smoke:cpanel] ${prefix} ${entry.name} -> ${entry.url}`)
    if (!entry.ok) {
        entry.issues.forEach((issue) => console.log(`[smoke:cpanel]   ${issue}`))
    }
})

if (outputPath) {
    await mkdir(path.dirname(outputPath), { recursive: true })
    await writeFile(outputPath, `${JSON.stringify(summary, null, 2)}\n`, 'utf8')
    console.log(`[smoke:cpanel] Wrote ${outputPath}`)
}

if (!summary.success) {
    process.exitCode = 1
}
