/**
 * A short, stable fingerprint of any JSON-able value.
 *
 * Object key order would otherwise decide whether two identical documents look
 * identical, which is the sort of false difference that makes a sync report
 * useless and then ignored.
 */

import { createHash } from 'node:crypto'

const stable = (value) => {
    if (Array.isArray(value)) return value.map(stable)
    if (value && typeof value === 'object') {
        return Object.fromEntries(Object.keys(value).sort().map((k) => [k, stable(value[k])]))
    }
    return value === undefined ? null : value
}

export const hash = (value) => createHash('sha256').update(JSON.stringify(stable(value))).digest('hex').slice(0, 12)
