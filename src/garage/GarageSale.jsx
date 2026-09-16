import { Suspense, lazy, useCallback, useEffect, useMemo, useState } from 'react'
import MarkerText from './MarkerText.jsx'
import HeroCrew from './HeroCrew.jsx'
import { claimHref, formatPrice } from './claimLink.js'
import { CATEGORIES, CONTACT, CREW_CAPTION, FINE_PRINT, HEADLINE_PALETTE, INTRO, ITEMS, STATUS } from './content.js'
import './garage.css'

// three.js is 700 KB nobody browsing a coat needs before the grid paints, so
// the headline arrives second — and its fallback is the SAME lettering drawn
// flat, which means the page never shows a hole where the title goes.
const GarageHero3D = lazy(() => import('./GarageHero3D.jsx'))

function PhotoFrame({ item }) {
    const [first] = item.photos || []
    if (!first) {
        return (
            <div className="garage-card__photo garage-card__photo--empty">
                <svg viewBox="0 0 100 75" aria-hidden="true" focusable="false">
                    <path d="M4 5 96 70M96 5 4 70" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" fill="none" />
                </svg>
                <span>photo soon</span>
            </div>
        )
    }
    return (
        <div className="garage-card__photo">
            <img src={first} alt={item.title} loading="lazy" decoding="async" />
            {item.photos.length > 1 ? (
                <span className="garage-card__count">+{item.photos.length - 1}</span>
            ) : null}
        </div>
    )
}

function ItemCard({ item, onOpen }) {
    const status = STATUS[item.status] || STATUS.available
    return (
        <li className={`garage-card garage-card--${status.tone}`} data-cat={item.category}>
            <button type="button" className="garage-card__hit" onClick={() => onOpen(item)}>
                <PhotoFrame item={item} />
                <span className="garage-card__body">
                    <span className="garage-card__title">{item.title}</span>
                    <MarkerText
                        className="garage-card__price"
                        text={formatPrice(item.price)}
                        size={22}
                        weight={0.13}
                    />
                    <span className="garage-card__meta">
                        {[item.size, item.condition].filter(Boolean).join(' · ')}
                    </span>
                </span>
                {item.status !== 'available' ? (
                    <span className={`garage-stamp garage-stamp--${status.tone}`}>
                        <MarkerText text={status.label} size={20} weight={0.14} tilt={0.05} />
                    </span>
                ) : null}
            </button>
        </li>
    )
}

function ItemDetail({ item, onClose }) {
    useEffect(() => {
        const onKey = (event) => { if (event.key === 'Escape') onClose() }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
    }, [onClose])

    const status = STATUS[item.status] || STATUS.available
    const href = item.status === 'sold' ? null : claimHref(item)

    return (
        <div className="garage-detail" role="dialog" aria-modal="true" aria-label={item.title} data-cat={item.category}>
            <div className="garage-detail__sheet">
                <button type="button" className="garage-detail__close" onClick={onClose} aria-label="Close">
                    <MarkerText text="X" size={20} weight={0.16} />
                </button>

                <div className="garage-detail__photos">
                    {(item.photos || []).length
                        ? item.photos.map((src, index) => (
                            <img key={src} src={src} alt={`${item.title} ${index + 1}`} loading="lazy" />
                        ))
                        : <div className="garage-card__photo garage-card__photo--empty"><span>photo soon</span></div>}
                </div>

                <div className="garage-detail__text">
                    <h2>{item.title}</h2>
                    <MarkerText className="garage-detail__price" text={formatPrice(item.price)} size={46} weight={0.13} />
                    <dl>
                        {item.size ? (<><dt>Size</dt><dd>{item.size}</dd></>) : null}
                        <dt>Condition</dt><dd>{item.condition}</dd>
                        <dt>Status</dt><dd>{status.label}</dd>
                    </dl>
                    {item.note ? <p className="garage-detail__note">{item.note}</p> : null}

                    {href ? (
                        <a className="garage-claim" href={href} target="_blank" rel="noreferrer noopener">
                            <MarkerText text={item.status === 'reserved' ? 'ask anyway' : 'take it'} size={26} weight={0.12} />
                        </a>
                    ) : (
                        <p className="garage-claim garage-claim--dead">Already gone. Sorry.</p>
                    )}
                    <p className="garage-detail__pickup">{CONTACT.pickup}</p>
                </div>
            </div>
            <button type="button" className="garage-detail__scrim" onClick={onClose} aria-label="Close" />
        </div>
    )
}

export default function GarageSale() {
    const [category, setCategory] = useState('all')
    const [openItem, setOpenItem] = useState(null)

    const counts = useMemo(() => {
        const tally = { all: ITEMS.length }
        for (const item of ITEMS) tally[item.category] = (tally[item.category] || 0) + 1
        return tally
    }, [])

    const visible = useMemo(() => {
        const list = category === 'all' ? ITEMS : ITEMS.filter((item) => item.category === category)
        // Gone things sink; they stay on the page because a garage sale with
        // nothing crossed out looks like nothing is happening.
        return [...list].sort((a, b) => Number(a.status === 'sold') - Number(b.status === 'sold'))
    }, [category])

    const close = useCallback(() => setOpenItem(null), [])

    return (
        <main className={`garage${openItem ? ' is-locked' : ''}`}>
            <header className="garage-hero">
                <div className="garage-hero__stage">
                    <Suspense fallback={(
                        <div className="garage-hero__flat">
                            <MarkerText text="GARAGE" size={64} weight={0.1} title="Garage sale" palette={HEADLINE_PALETTE} />
                            {/* rotated by the six letters of GARAGE, so the flat
                                fallback colours the same letters the 3D one does */}
                            <MarkerText text="SALE" size={64} weight={0.1} palette={[...HEADLINE_PALETTE.slice(6), ...HEADLINE_PALETTE.slice(0, 6)]} />
                        </div>
                    )}>
                        <GarageHero3D />
                    </Suspense>
                </div>

                <div className="garage-hero__intro">
                    <figure className="garage-hero__crew">
                        <HeroCrew />
                        <figcaption>{CREW_CAPTION}</figcaption>
                    </figure>
                    <div className="garage-hero__words">
                        {INTRO.map((line) => <p key={line}>{line}</p>)}
                    </div>
                </div>
            </header>

            <nav className="garage-filters" aria-label="Categories">
                {CATEGORIES.map((entry) => (
                    <button
                        key={entry.id}
                        type="button"
                        className={`garage-filter${category === entry.id ? ' is-active' : ''}`}
                        data-cat={entry.id}
                        onClick={() => setCategory(entry.id)}
                        aria-pressed={category === entry.id}
                    >
                        <MarkerText text={entry.label} size={26} weight={0.11} title={entry.label} />
                        <span className="garage-filter__count">{counts[entry.id] || 0}</span>
                    </button>
                ))}
            </nav>

            <ul className="garage-grid">
                {visible.map((item) => <ItemCard key={item.id} item={item} onOpen={setOpenItem} />)}
            </ul>

            {visible.length === 0 ? (
                <p className="garage-empty">Nothing left in here. Try another shelf.</p>
            ) : null}

            <footer className="garage-foot">
                <p>{FINE_PRINT}</p>
                <MarkerText text="thank you" size={30} weight={0.11} title="Thank you" />
            </footer>

            {openItem ? <ItemDetail item={openItem} onClose={close} /> : null}
        </main>
    )
}
