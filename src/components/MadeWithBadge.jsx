import './madeWithBadge.css'

// The public viewer and exhibitions are di.iiii's widest audience and
// previously offered no path from watching into making. One quiet affordance,
// shared by every public surface. variant: 'chrome' flows inside the
// live-scene header; 'floating' pins itself to the bottom-left corner.
export default function MadeWithBadge({ variant = 'floating' }) {
    return (
        <a
            className={`made-with-di made-with-di--${variant}`}
            href="/"
            aria-label="Made with di.iiii — build your own space"
        >
            <span className="made-with-di-mark" aria-hidden="true">◈</span>
            <span className="made-with-di-text">Made with di.iiii</span>
            <span className="made-with-di-cta">— build yours</span>
        </a>
    )
}
