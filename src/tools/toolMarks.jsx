/**
 * The marks on the tool tiles.
 *
 * A tile with nothing but a word on it reads as a placeholder — every serious
 * launcher (Blender, Unreal, Resolve, Notch) leads with a picture. These are
 * drawn, not photographed: a live thumbnail would mean booting the tool to show
 * its own picture, which is exactly what a door must not do. One weight, one
 * colour, currentColor throughout, so a tile that is dimmed dims its mark too.
 */

const line = { fill: 'none', stroke: 'currentColor', strokeWidth: 1, vectorEffect: 'non-scaling-stroke' }

export const StudioMark = () => (
    <svg viewBox="0 0 160 90" aria-hidden="true">
        <g {...line} opacity="0.45">
            <path d="M0 58 H160" />
            <path d="M26 90 L58 58" />
            <path d="M70 90 L82 58" />
            <path d="M134 90 L102 58" />
            <path d="M0 74 H160" />
        </g>
        <g {...line}>
            <path d="M64 34 H100 V62 H64 Z" />
            <path d="M64 34 L74 26 H110 L100 34" />
            <path d="M110 26 V54 L100 62" />
        </g>
    </svg>
)

export const RawMark = () => (
    <svg viewBox="0 0 160 90" aria-hidden="true">
        <g {...line}>
            <rect x="18" y="24" width="34" height="20" rx="2" />
            <rect x="64" y="52" width="34" height="20" rx="2" />
            <rect x="110" y="20" width="32" height="20" rx="2" />
            <path d="M52 34 C60 34 58 62 64 62" />
            <path d="M98 62 C106 62 104 30 110 30" />
        </g>
        <g fill="currentColor">
            <circle cx="52" cy="34" r="2" />
            <circle cx="64" cy="62" r="2" />
            <circle cx="98" cy="62" r="2" />
            <circle cx="110" cy="30" r="2" />
        </g>
    </svg>
)

export const LightMark = () => (
    <svg viewBox="0 0 160 90" aria-hidden="true">
        <g {...line} opacity="0.5">
            <path d="M42 20 L26 74 H58 Z" />
            <path d="M80 20 L70 74 H90 Z" />
            <path d="M118 20 L102 74 H134 Z" />
        </g>
        <g {...line}>
            <path d="M28 20 H56" />
            <path d="M68 20 H92" />
            <path d="M104 20 H132" />
        </g>
        <g fill="currentColor">
            <rect x="36" y="16" width="12" height="8" />
            <rect x="74" y="16" width="12" height="8" />
            <rect x="112" y="16" width="12" height="8" />
        </g>
    </svg>
)

export const MapperMark = () => (
    <svg viewBox="0 0 160 90" aria-hidden="true">
        <g {...line} opacity="0.35">
            <path d="M20 18 H140 M20 42 H140 M20 66 H140" />
            <path d="M44 12 V78 M80 12 V78 M116 12 V78" />
        </g>
        <g {...line}>
            <path d="M38 28 L118 20 L126 66 L46 72 Z" />
        </g>
        <g fill="currentColor">
            <rect x="35" y="25" width="6" height="6" />
            <rect x="115" y="17" width="6" height="6" />
            <rect x="123" y="63" width="6" height="6" />
            <rect x="43" y="69" width="6" height="6" />
        </g>
    </svg>
)

export const DeskMark = () => (
    <svg viewBox="0 0 160 90" aria-hidden="true">
        <g {...line}>
            <rect x="22" y="18" width="60" height="42" rx="2" />
            <path d="M22 28 H82" />
            <rect x="62" y="36" width="60" height="42" rx="2" />
            <path d="M62 46 H122" />
        </g>
        <g fill="currentColor" opacity="0.7">
            <circle cx="29" cy="23" r="1.6" />
            <circle cx="35" cy="23" r="1.6" />
            <circle cx="69" cy="41" r="1.6" />
            <circle cx="75" cy="41" r="1.6" />
        </g>
    </svg>
)
