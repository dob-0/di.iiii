import { describe, expect, it } from 'vitest'
import { buildCsv } from './OpenCallSection.jsx'

const makeApp = (overrides = {}) => ({
    id: 'app-1',
    createdAt: Date.parse('2026-07-16T00:00:00Z'),
    status: 'new',
    name: 'Test Applicant',
    email: 'test@example.am',
    phone: '+374 00 000000',
    city: 'Gyumri',
    payload: {},
    notes: '',
    ...overrides
})

// Regression test for audit finding #15: a submitted field value starting
// with =, +, -, or @ is interpreted as a formula by Excel/Google Sheets when
// the exported CSV is opened there — a public open-call form is a direct
// attacker-controlled input into this export. csvEscape must neutralize
// that by prefixing a leading apostrophe (the standard mitigation).
describe('buildCsv (CSV formula injection guard)', () => {
    it('prefixes a leading apostrophe on fields starting with =, +, -, or @', () => {
        const app = makeApp({
            name: '=cmd|/c calc!A1',
            payload: { about: '+1+1', idea: '-2+3', portfolio: '@SUM(1,2)' }
        })
        const csv = buildCsv([app])
        const dataRow = csv.split('\n')[1]

        expect(dataRow).toContain('"\'=cmd|/c calc!A1"')
        expect(dataRow).toContain('"\'+1+1"')
        expect(dataRow).toContain('"\'-2+3"')
        expect(dataRow).toContain('"\'@SUM(1,2)"')
    })

    // Phone numbers legitimately start with '+' (international format) —
    // still gets the apostrophe prefix, same as any other leading '+'. This
    // is correct, not a false positive: Excel needs it to avoid mangling the
    // leading '+' as arithmetic, and the apostrophe itself never displays.
    it('also guards a legitimate leading-plus phone number the same way', () => {
        const app = makeApp({ phone: '+374 00 000000' })
        const csv = buildCsv([app])
        const dataRow = csv.split('\n')[1]
        expect(dataRow).toContain('"\'+374 00 000000"')
    })

    it('leaves ordinary field values untouched', () => {
        const app = makeApp({ name: 'Jane Doe', payload: { about: 'A regular sentence.' } })
        const csv = buildCsv([app])
        const dataRow = csv.split('\n')[1]

        expect(dataRow).toContain('"Jane Doe"')
        expect(dataRow).toContain('"A regular sentence."')
        expect(dataRow).not.toContain("'Jane")
    })

    it('still quote-escapes double quotes as before', () => {
        const app = makeApp({ name: 'Jane "JD" Doe' })
        const csv = buildCsv([app])
        const dataRow = csv.split('\n')[1]
        expect(dataRow).toContain('"Jane ""JD"" Doe"')
    })
})
