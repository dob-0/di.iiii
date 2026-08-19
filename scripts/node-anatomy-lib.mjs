// The measuring half of "what a node is made of".
//
// Finds where each node type's code actually lives — its case in the runtime
// switch, its case in the viewport's renderNodeBody, its branch in the
// editor's panel if-chain — and reports each as a LINE RANGE in a named file.
// The browser then slices the real source by those ranges; nothing in the
// product ever pattern-matches source text at runtime.
//
// Parsed with acorn, never regexed. A regex slicer was tried against the real
// runtime file during design and produced three distinct wrong answers, all
// rendered confidently: a fall-through case (value.number) returned a bare
// label with no body, a section-header comment belonging to the NEXT case was
// glued onto the previous one, and the editor's if-chain — a fourth place code
// lives — was invisible to a `case '…':` pattern entirely.
import { Parser } from 'acorn'
import jsx from 'acorn-jsx'

const JsxParser = Parser.extend(jsx())

const parse = (source) => JsxParser.parse(source, {
    ecmaVersion: 'latest',
    sourceType: 'module',
    locations: true
})

const walk = (node, visit) => {
    if (!node || typeof node.type !== 'string') return
    visit(node)
    for (const key of Object.keys(node)) {
        if (key === 'loc') continue
        const value = node[key]
        if (Array.isArray(value)) value.forEach((child) => walk(child, visit))
        else if (value && typeof value.type === 'string') walk(value, visit)
    }
}

const functionNode = (ast, fnName) => {
    let found = null
    walk(ast, (node) => {
        if (found) return
        if (node.type === 'FunctionDeclaration' && node.id?.name === fnName) found = node
        if (node.type === 'VariableDeclarator' && node.id?.name === fnName
            && (node.init?.type === 'ArrowFunctionExpression' || node.init?.type === 'FunctionExpression')) {
            found = node.init
        }
    })
    return found
}

// Which output port ids a case answers: every string literal compared against
// the identifier `portId` inside it, `===` and `!==` alike (port.in's guard is
// `portId !== 'value'`, and 'value' is exactly the port it answers).
const answersIn = (nodes) => {
    const answers = new Set()
    nodes.forEach((node) => walk(node, (child) => {
        if (child.type !== 'BinaryExpression') return
        if (child.operator !== '===' && child.operator !== '!==') return
        const sides = [child.left, child.right]
        const port = sides.find((side) => side.type === 'Identifier' && side.name === 'portId')
        const literal = sides.find((side) => side.type === 'Literal' && typeof side.value === 'string')
        if (port && literal) answers.add(literal.value)
    }))
    return [...answers]
}

/**
 * Every case group of the `switch (node.typeId)` inside fnName, with the line
 * range of its body. Fall-through labels accumulate into ONE group — that is a
 * structural fact of the switch, not a slicing guess — and the range starts at
 * the group's first `case` line and ends at its last statement, so a comment
 * sitting above the NEXT case can never be swallowed (the trailing-comment
 * mis-attribution is the second of the three regex defects above).
 */
export function extractSwitchCases(source, fnName) {
    const fn = functionNode(parse(source), fnName)
    if (!fn) throw new Error(`no function named ${fnName}`)
    let switchNode = null
    walk(fn, (node) => {
        if (switchNode || node.type !== 'SwitchStatement') return
        let mentionsTypeId = false
        walk(node.discriminant, (child) => {
            if (child.type === 'Identifier' && child.name === 'typeId') mentionsTypeId = true
        })
        if (mentionsTypeId) switchNode = node
    })
    if (!switchNode) throw new Error(`no typeId switch inside ${fnName}`)

    const groups = []
    let pending = []
    for (const caseNode of switchNode.cases) {
        if (caseNode.test == null) { pending = []; continue } // default: is nobody's code
        pending.push(caseNode)
        if (caseNode.consequent.length === 0) continue
        const last = caseNode.consequent[caseNode.consequent.length - 1]
        groups.push({
            typeIds: pending.map((c) => c.test.value),
            fromLine: pending[0].loc.start.line,
            toLine: last.loc.end.line,
            answers: answersIn(caseNode.consequent)
        })
        pending = []
    }
    return groups
}

/**
 * The `if (node.typeId === '…')` chain inside fnName — the fourth place code
 * lives, and the one a switch-shaped extractor reports as "no code" for every
 * type in it.
 */
export function extractIfChain(source, fnName) {
    const fn = functionNode(parse(source), fnName)
    if (!fn) throw new Error(`no function named ${fnName}`)
    const branches = []
    walk(fn, (node) => {
        if (node.type !== 'IfStatement' || node.test?.type !== 'BinaryExpression') return
        if (node.test.operator !== '===') return
        const { left, right } = node.test
        const isTypeId = left.type === 'MemberExpression' && left.property?.name === 'typeId'
        if (!isTypeId || right.type !== 'Literal' || typeof right.value !== 'string') return
        branches.push({
            typeIds: [right.value],
            fromLine: node.loc.start.line,
            toLine: node.consequent.loc.end.line,
            answers: []
        })
    })
    return branches
}

/**
 * The doorway read — the block at the top of computeNodeOutput that answers a
 * container's promoted sockets BEFORE the type switch is ever consulted. Every
 * container shares these lines; the sheet's `a door` sentence points here.
 */
export function extractDoorwaySpan(source, fnName) {
    const fn = functionNode(parse(source), fnName)
    if (!fn) throw new Error(`no function named ${fnName}`)
    const body = fn.body?.body || []
    const switchIndex = body.findIndex((node) => node.type === 'SwitchStatement')
    if (switchIndex < 1) throw new Error(`no statements before the switch in ${fnName}`)
    return { fromLine: body[0].loc.start.line, toLine: body[switchIndex - 1].loc.end.line }
}
