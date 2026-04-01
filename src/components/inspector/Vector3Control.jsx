import { useEffect, useMemo, useState } from 'react'
import {
    evaluateExpressionString,
    getExpressionContext,
    isLikelyExpression
} from '../../utils/expressions.js'

const formatNumberString = (input) => {
    const parsed = Number(input)
    if (!Number.isFinite(parsed)) return '0.00'
    return parsed.toFixed(2)
}

const VECTOR_SIZE = 3
const DEFAULT_VECTOR = Object.freeze([0, 0, 0])
const DEFAULT_EXPRESSIONS = Object.freeze(Array(VECTOR_SIZE).fill(null))

export default function Vector3Control({
    label,
    value = DEFAULT_VECTOR,
    expressions = DEFAULT_EXPRESSIONS,
    axisLabels = ['X', 'Y', 'Z'],
    onCommit
}) {
    const safeValue = useMemo(
        () => (Array.isArray(value) && value.length === VECTOR_SIZE ? value : DEFAULT_VECTOR),
        [value]
    )
    const safeExpressions = useMemo(
        () => (Array.isArray(expressions) && expressions.length === VECTOR_SIZE ? expressions : DEFAULT_EXPRESSIONS),
        [expressions]
    )

    const [inputs, setInputs] = useState(() =>
        safeValue.map((component, idx) => safeExpressions?.[idx] ?? formatNumberString(component ?? 0))
    )
    const [isEditing, setIsEditing] = useState(() => Array(VECTOR_SIZE).fill(false))

    useEffect(() => {
        setInputs(prev =>
            safeValue.map((component, idx) =>
                isEditing[idx]
                    ? prev[idx]
                    : (safeExpressions?.[idx] ?? formatNumberString(component ?? 0))
            )
        )
    }, [safeValue, safeExpressions, isEditing])

    const getModifierStep = (event) => {
        if (event.shiftKey) return 0.1
        if (event.altKey) return 0.001
        if (event.ctrlKey || event.metaKey) return 0.0001
        return 0.01
    }

    const resolveNumericValue = (raw, fallback) => {
        const parsed = Number(raw)
        if (Number.isFinite(parsed)) return parsed
        const fallbackNumber = Number(fallback)
        if (Number.isFinite(fallbackNumber)) return fallbackNumber
        return 0
    }

    const commit = (axisIndex, raw) => {
        const nextValues = [...safeValue]
        const nextExpr = [...safeExpressions]
        const trimmed = raw?.trim()
        if (!trimmed) {
            nextValues[axisIndex] = 0
            nextExpr[axisIndex] = null
            onCommit(nextValues, nextExpr)
            setInputs(prev => {
                const clone = [...prev]; clone[axisIndex] = formatNumberString(0); return clone
            })
            return
        }
        const hasLetters = isLikelyExpression(trimmed)
        const context = getExpressionContext()
        let resolved = evaluateExpressionString(trimmed, context)
        if (!hasLetters && (resolved === null || Number.isNaN(Number(trimmed)))) {
            resolved = Number(trimmed)
        }
        if (resolved === null || !Number.isFinite(resolved)) {
            setInputs(prev => {
                const clone = [...prev]; clone[axisIndex] = safeExpressions?.[axisIndex] ?? formatNumberString(safeValue?.[axisIndex] ?? 0); return clone
            })
            return
        }
        nextValues[axisIndex] = resolved
        nextExpr[axisIndex] = hasLetters ? trimmed : null
        onCommit(nextValues, nextExpr)
        setInputs(prev => {
            const clone = [...prev]; clone[axisIndex] = hasLetters ? trimmed : formatNumberString(resolved); return clone
        })
    }

    const adjust = (axisIndex, delta) => {
        const currentValue = resolveNumericValue(inputs[axisIndex], safeValue?.[axisIndex])
        const nextValue = Number((currentValue + delta).toFixed(6))
        const nextValues = [...safeValue]
        const nextExpr = [...safeExpressions]
        nextValues[axisIndex] = nextValue
        nextExpr[axisIndex] = null
        onCommit(nextValues, nextExpr)
        setInputs(prev => {
            const clone = [...prev]; clone[axisIndex] = formatNumberString(nextValue); return clone
        })
    }

    return (
        <div className="prop-row-stacked">
            <label>{label}</label>
            <div className="vec3-control">
                {axisLabels.map((axisLabel, axisIndex) => (
                    <label className="vec3-axis" key={axisLabel}>
                        <span>{axisLabel}</span>
                        <input
                            type="text"
                            inputMode="decimal"
                            value={inputs[axisIndex]}
                            onFocus={() => {
                                setIsEditing(prev => {
                                    const clone = [...prev]
                                    clone[axisIndex] = true
                                    return clone
                                })
                            }}
                            onChange={(e) => {
                                const next = e.target.value
                                setInputs(prev => { const clone = [...prev]; clone[axisIndex] = next; return clone })
                            }}
                            onBlur={() => {
                                setIsEditing(prev => {
                                    const clone = [...prev]
                                    clone[axisIndex] = false
                                    return clone
                                })
                                commit(axisIndex, inputs[axisIndex])
                            }}
                            onKeyDown={(e) => {
                                if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                                    e.preventDefault()
                                    const direction = e.key === 'ArrowUp' ? 1 : -1
                                    const step = getModifierStep(e)
                                    adjust(axisIndex, direction * step)
                                }
                                if (e.key === 'Enter') {
                                    commit(axisIndex, inputs[axisIndex])
                                }
                            }}
                            onWheel={(e) => {
                                const direction = e.deltaY < 0 ? 1 : -1
                                const step = getModifierStep(e)
                                adjust(axisIndex, direction * step)
                            }}
                        />
                    </label>
                ))}
            </div>
        </div>
    )
}
