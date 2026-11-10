import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { storedLogin } from './stored-login.mjs'

const dirs = []
const makeFile = (body, mode = 0o600) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'stored-login-'))
    dirs.push(dir)
    const file = path.join(dir, 'credentials.json')
    fs.writeFileSync(file, typeof body === 'string' ? body : JSON.stringify(body), { mode })
    fs.chmodSync(file, mode)
    return file
}
afterEach(() => {
    delete process.env.DI_CREDENTIALS_FILE
    while (dirs.length) fs.rmSync(dirs.pop(), { recursive: true, force: true })
})

describe('storedLogin', () => {
    const future = Date.now() + 86400000
    it('returns the dev token and user when the session is valid', () => {
        process.env.DI_CREDENTIALS_FILE = makeFile({ dev: { token: 'T-dev', expiresAt: future, user: { name: 'Gev' } } })
        expect(storedLogin('dev')).toMatchObject({ token: 'T-dev', user: 'Gev' })
    })
    it('refuses prod: production keeps its window', () => {
        process.env.DI_CREDENTIALS_FILE = makeFile({ prod: { token: 'T-prod', expiresAt: future } })
        expect(storedLogin('prod').token).toBeNull()
    })
    it('refuses an expired session and says so', () => {
        process.env.DI_CREDENTIALS_FILE = makeFile({ dev: { token: 'T', expiresAt: 1000 } })
        const r = storedLogin('dev')
        expect(r.token).toBeNull()
        expect(r.why).toMatch(/expired/)
    })
    it('refuses a file other users can read', () => {
        process.env.DI_CREDENTIALS_FILE = makeFile({ dev: { token: 'T', expiresAt: future } }, 0o644)
        expect(storedLogin('dev').why).toMatch(/readable by others/)
    })
    it('says run di login when the file is missing or broken, and never leaks the token in why', () => {
        process.env.DI_CREDENTIALS_FILE = path.join(os.tmpdir(), 'no-such-credentials.json')
        expect(storedLogin('dev').why).toMatch(/di login/)
        process.env.DI_CREDENTIALS_FILE = makeFile('{not json')
        expect(storedLogin('dev').token).toBeNull()
    })
})
