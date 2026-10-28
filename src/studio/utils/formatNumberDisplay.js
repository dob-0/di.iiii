// What a number field shows: a stored 0.5844327… reads 0.5844 (4 decimals, trailing zeros
// dropped). The stored value is never rounded by this — only an edit changes it (P10, owner walk
// 2026-10-07).
export const formatNumberDisplay = (value) => {
    const n = Number(value)
    if (value === '' || value == null || !Number.isFinite(n)) return value ?? ''
    return String(Math.round(n * 10000) / 10000)
}
