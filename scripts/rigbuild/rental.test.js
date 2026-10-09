import { describe, expect, it } from 'vitest'
import JSZip from 'jszip'
import { readSheetCells, readSharedStrings, readXlsx, rowsOf, unescapeXml } from './xlsx.mjs'
import { rentalListFrom, rentalOps } from './rental.mjs'
import { rentalCounts, countWords, RIG_SHOW_ID } from '../../src/rigbuild/rental.js'
import { TYPE_LIBRARY } from '../../src/rigbuild/types/index.js'

// A two-sheet workbook the way Google Sheets writes one: shared strings, an inline
// string, a formula with its cached value, a hidden sheet.
const workbookXml = `<?xml version="1.0"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet state="hidden" name="Price data" sheetId="2" r:id="rId5"/><sheet state="visible" name="Price list" sheetId="3" r:id="rId6"/></sheets></workbook>`
const relsXml = `<Relationships xmlns="x"><Relationship Id="rId5" Type="t" Target="worksheets/sheet2.xml"/><Relationship Id="rId6" Type="t" Target="worksheets/sheet3.xml"/></Relationships>`
const strings = ['Moving heads', '380W beam &amp; head', 'UP-B380F', 'PAR &amp; wash', '54x3W LED PAR', 'UP-PL5403']
const sharedXml = `<sst>${strings.map((s) => `<si><t>${s}</t></si>`).join('')}<si><r><t>rich </t></r><r><t>run</t></r></si></sst>`
const priceList = `<worksheet><sheetData>
<row r="5"><c r="A5" t="s"><v>0</v></c></row>
<row r="6"><c r="A6" t="s"><v>1</v></c><c r="B6" t="s"><v>2</v></c><c r="D6"><v>18.0</v></c><c r="E6"><v>200.0</v></c><c r="F6"><f>E6*1.5</f><v>300</v></c></row>
<row r="12"><c r="A12" t="s"><v>3</v></c></row>
<row r="13"><c r="A13" t="s"><v>4</v></c><c r="B13" t="s"><v>5</v></c><c r="C13" t="inlineStr"><is><t>RGBW &lt;wash&gt;</t></is></c><c r="D13"><v>50</v></c><c r="E13"><v>50</v></c></row>
</sheetData></worksheet>`
const priceData = `<worksheet><sheetData><row r="2"><c r="C2"><v>18</v></c><c r="D2"><v>190</v></c><c r="E2" t="str"><v>UP-B380F</v></c></row></sheetData></worksheet>`

const makeXlsx = async () => {
    const zip = new JSZip()
    zip.file('xl/workbook.xml', workbookXml)
    zip.file('xl/_rels/workbook.xml.rels', relsXml)
    zip.file('xl/sharedStrings.xml', sharedXml)
    zip.file('xl/worksheets/sheet2.xml', priceData)
    zip.file('xl/worksheets/sheet3.xml', priceList)
    return zip.generateAsync({ type: 'uint8array' })
}

const order = {
    show: 'TEST', writtenAt: '2026-09-28', source: 'a test',
    items: [{ code: 'UP-B380F', ordered: 18, said: '18x UP-B380F' }, { code: 'UP-PL5403', ordered: 60, said: '60 pars' }]
}

describe('xlsx.mjs — cell values of an Office Open XML workbook', () => {
    it('reads shared strings, runs included, and unescapes entities', () => {
        expect(readSharedStrings(sharedXml)).toEqual(['Moving heads', '380W beam & head', 'UP-B380F', 'PAR & wash', '54x3W LED PAR', 'UP-PL5403', 'rich run'])
        expect(unescapeXml('&#x41;&#66;&amp;')).toBe('AB&')
    })
    it('reads a formula as its cached value and keeps the formula beside it', () => {
        const cells = readSheetCells(priceList, readSharedStrings(sharedXml))
        expect(cells.F6).toEqual({ value: 300, type: 'n', formula: 'E6*1.5' })
        expect(cells.C13.value).toBe('RGBW <wash>')
    })
    it('finds sheets through the workbook relationships, hidden ones too', async () => {
        const wb = await readXlsx(await makeXlsx())
        expect(wb.sheets.map((s) => [s.name, s.state])).toEqual([['Price data', 'hidden'], ['Price list', 'visible']])
        expect(rowsOf(wb.sheets[1]).find((r) => r.row === 6)).toMatchObject({ A: '380W beam & head', B: 'UP-B380F', D: 18, E: 200 })
    })
})

describe('rental.mjs — the rental list from the spreadsheet and the order', () => {
    it('matches each order line by code, with its stock and cells, never writes the rate, and says (without the number) where the sheets disagree', async () => {
        const list = rentalListFrom({ workbook: await readXlsx(await makeXlsx()), order, file: '/x/q.xlsx', sha256: 'ab'.repeat(32) })
        expect(list.items[0]).toMatchObject({ code: 'UP-B380F', type: 'up-b380f', ordered: 18, stock: 18, label: '380W beam & head' })
        expect(list.items[0].source).toBe('Price list!A6:E6 · ordered as "18x UP-B380F"')
        expect(list.items[0].note).toMatch(/hidden "Price data" sheet differs from the visible price list/)
        // the supplier's rates are read but never written: not one price field, not one number from the sheet
        expect(list.items[0]).not.toHaveProperty('rate')
        expect(list.catalogue.some((c) => 'rate' in c)).toBe(false)
        expect(JSON.stringify(list)).not.toMatch(/"rate"|\b(200|190|50)\b.*AMD/)
        // An order above the house's stock is written and noted, not refused.
        expect(list.items[1]).toMatchObject({ code: 'UP-PL5403', ordered: 60, stock: 50 })
        expect(list.items[1].note).toMatch(/order 60 is above the 50 the house lists/)
        expect(list.source).toMatch(/q\.xlsx \(sha256 abababababab…/)
    })
    it('refuses an ordered code the spreadsheet does not list', async () => {
        const wb = await readXlsx(await makeXlsx())
        expect(() => rentalListFrom({ workbook: wb, order: { ...order, items: [{ code: 'UP-NOPE', ordered: 1, said: 'x' }] }, file: 'q.xlsx', sha256: '0'.repeat(64) })).toThrow(/UP-NOPE/)
    })
    it('writes onto the show entity, creating it when missing', () => {
        const list = { items: [{ code: 'A', type: 'a', ordered: 1 }] }
        expect(rentalOps([], list)[0]).toMatchObject({ type: 'createEntity', payload: { entity: { id: RIG_SHOW_ID, components: { rentalList: list } } } })
        expect(rentalOps([{ id: RIG_SHOW_ID }], list)[0]).toMatchObject({ type: 'updateComponent', payload: { entityId: RIG_SHOW_ID, component: 'rentalList' } })
    })
})

describe('rental.js — placed against ordered', () => {
    const lamp = (id, type) => ({ id, type: 'spotLight', components: { fixture: { type } } })
    const list = { items: [{ code: 'UP-250BSW', type: 'up-250bsw', ordered: 12 }, { code: 'UP-B380F', type: 'up-b380f', ordered: 2 }] }
    it('counts lamps by type: left, over, and types nobody ordered', () => {
        const entities = [...Array.from({ length: 9 }, (_, i) => lamp(`s${i}`, 'up-250bsw')), lamp('b1', 'up-b380f'), lamp('b2', 'up-b380f'), lamp('b3', 'up-b380f'), lamp('h1', 'up-hk1915')]
        const { items, totals } = rentalCounts({ entities, library: TYPE_LIBRARY, list })
        expect(items[0]).toMatchObject({ code: 'UP-250BSW', placed: 9, left: 3, over: 0, footprint: 24 })
        expect(countWords(items[0])).toBe('3 left of 12')
        expect(countWords(items[1])).toBe('3 placed · 1 over the order of 2')
        expect(items[2]).toMatchObject({ code: 'UP-HK1915', unlisted: true, placed: 1 })
        expect(totals).toEqual({ ordered: 14, placed: 13, left: 3, over: 2 })
    })
})
