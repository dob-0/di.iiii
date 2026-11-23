'use strict'
// The offline page is served through the app's own scheme, not file://: the
// shipped app turns the GrantFileProtocolExtraPrivileges fuse off, and with it
// off a page inside app.asar can no longer be loaded as file://. No Electron
// import here, so it unit-tests in plain Node.

const SCHEME = 'di-offline'
const FILES = Object.freeze({
    'offline.html': 'text/html; charset=utf-8',
    'offline.js': 'text/javascript; charset=utf-8'
})

const offlineUrl = (target, code) =>
    `${SCHEME}://app/offline.html?${new URLSearchParams({ target: String(target), code: String(code) })}`

// Answers { status, type, body } for a request URL; `read(name)` gives the file's bytes.
const serveOffline = (requestUrl, read) => {
    let url
    try {
        url = new URL(requestUrl)
    } catch {
        return { status: 400, type: 'text/plain', body: 'bad request' }
    }
    const name = url.pathname.replace(/^\//, '')
    if (url.protocol !== `${SCHEME}:` || !Object.prototype.hasOwnProperty.call(FILES, name)) {
        return { status: 404, type: 'text/plain', body: 'not found' }
    }
    return { status: 200, type: FILES[name], body: read(name) }
}

module.exports = { SCHEME, offlineUrl, serveOffline }
