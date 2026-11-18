'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const { NAMES, compare } = require('../scripts/check-fuses')
const { build, devDependencies } = require('../package.json')

const report = (overrides = {}) => Object.values(NAMES)
    .map((name) => `  ${name} is ${overrides[name] || (build.electronFuses[Object.keys(NAMES).find((k) => NAMES[k] === name)] ? 'Enabled' : 'Disabled')}`)
    .join('\n')

test('fuses: the report that matches the config passes', () => {
    assert.deepEqual(compare(report(), build.electronFuses), [])
})

test('fuses: a different value, a missing line and an unset config key are all mismatches', () => {
    assert.equal(compare(report({ RunAsNode: 'Enabled' }), build.electronFuses).length, 1)
    assert.equal(compare(report().split('\n').filter((l) => !l.includes('OnlyLoadAppFromAsar')).join('\n'), build.electronFuses).length, 1)
    const without = { ...build.electronFuses }
    delete without.runAsNode
    const problems = compare(report(), without)
    assert.equal(problems.length, 1)
    assert.match(problems[0], /RunAsNode is not set/)
    assert.equal(compare(report(), undefined).length, Object.keys(NAMES).length)
})

test('fuses: @electron/fuses is declared with an exact version', () => {
    assert.match(devDependencies['@electron/fuses'], /^\d+\.\d+\.\d+$/)
})
