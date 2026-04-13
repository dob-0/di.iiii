const SAFE_PATTERN = /^[0-9+\-*/()., \t\r\nA-Za-z_]*$/;
const ALLOWED_IDENTIFIERS = new Set([
    'sin',
    'cos',
    'tan',
    'abs',
    'sqrt',
    'pow',
    'min',
    'max',
    'floor',
    'ceil',
    'round',
    'random',
    'rand',
    'pi',
    'time',
    'abstime'
]);

const DEFAULT_FUNCTIONS = {
    sin: Math.sin,
    cos: Math.cos,
    tan: Math.tan,
    abs: Math.abs,
    sqrt: Math.sqrt,
    pow: Math.pow,
    min: Math.min,
    max: Math.max,
    floor: Math.floor,
    ceil: Math.ceil,
    round: Math.round,
    random: Math.random,
    rand: Math.random
};

export const isLikelyExpression = (input) => {
    if (typeof input !== 'string') return false;
    return /[A-Za-z_]/.test(input);
};

export const getExpressionContext = (time = performance.now() / 1000, extras = {}) => ({
    ...DEFAULT_FUNCTIONS,
    PI: Math.PI,
    time,
    absTime: time,
    ...extras
});

export const evaluateExpressionString = (expression, context = {}, options = {}) => {
    if (typeof expression !== 'string') return null;
    const trimmed = expression.trim();
    if (!trimmed) return null;
    if (!SAFE_PATTERN.test(trimmed)) return null;
    const identifiers = trimmed.match(/[A-Za-z_][A-Za-z0-9_]*/g) || [];
    if (!identifiers.every((identifier) => ALLOWED_IDENTIFIERS.has(identifier.toLowerCase()))) {
        return null;
    }
    const fnArgs = Object.keys(context);
    const fnValues = Object.values(context);
    try {
        // eslint-disable-next-line no-new-func
        const evaluator = new Function(...fnArgs, `return (${trimmed});`);
        const result = evaluator(...fnValues);
        if (!Number.isFinite(result)) return null;
        return result;
    } catch (error) {
        console.warn('Expression evaluation failed', error);
        return null;
    }
};
