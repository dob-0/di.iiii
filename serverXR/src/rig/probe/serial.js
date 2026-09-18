// Serial ports: USB and ACM tty devices under /dev.
'use strict'

const fs = require('fs')
const path = require('path')

function readSerial(fsRoot) {
    const devDir = path.join(fsRoot, '/dev')
    let entries = []
    try {
        entries = fs.readdirSync(devDir)
    } catch {
        return []
    }

    return entries
        .filter((e) => /^tty(USB|ACM)\d+$/.test(e))
        .sort()
        .map((e) => ({ path: `/dev/${e}` }))
}

module.exports = { readSerial }
