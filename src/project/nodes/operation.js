// Which operation an operator-family node is set to.
//
// Deliberately reads the raw string rather than importing the registry: a
// colocated runtime is handed everything it needs and imports nothing that
// could reach back into the graph. The fallback is the same value the
// registry declares in `defaultValues.operation`, and
// nodeRuntimes.test.js holds the two together so they cannot drift.
export const operationOf = (node, fallback) => {
    const chosen = node?.values?.operation
    return typeof chosen === 'string' && chosen ? chosen : fallback
}
