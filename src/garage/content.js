// Everything a non-developer should be able to change lives here: the words,
// the categories, and where "claim it" sends people. No JSX below this line.

// Both names, one inbox. Every claim goes to the same place regardless of
// whose thing it was — no per-item owner to keep straight.
export const SELLERS = ['Taron', 'Yeva']

// "Taron and Yeva" / "Taron & Yeva", built once so the greeting in a WhatsApp
// message can never drift from the names on the page.
export const SELLERS_LABEL = SELLERS.join(' and ')
export const SELLERS_SHORT = SELLERS.join(' & ')

export const MASCOT = 'Pom'

export const INTRO = [
    "Hi, we're Taron and Yeva. We're moving.",
    'Everything here came with us, stayed a while, and now wants to find another home.',
    'Whatever you take helps pay for our studies abroad. So: fair trade.'
]

export const CREW_CAPTION = `That is ${MASCOT}. ${MASCOT} belongs to Yeva. ${MASCOT} is not for sale.`

export const FINE_PRINT = 'Cash or transfer · pickup in person · no delivery, sorry · first to message gets it'

// TODO(owner): real number and address before this goes anywhere public.
// `whatsapp` is digits only, country code first, no + and no spaces. One
// number for both of them — whoever picks up the phone answers.
export const CONTACT = {
    whatsapp: '',
    email: 'taron@example.com',
    instagram: '',
    // Shown once someone has claimed something — never a full street address
    // on a public page.
    pickup: 'Pickup details once we agree — we will send the address.'
}

export const CATEGORIES = [
    { id: 'all', label: 'Everything' },
    { id: 'clothes', label: 'Clothes' },
    { id: 'electronics', label: 'Electronics' },
    { id: 'souvenirs', label: 'Souvenirs' },
    { id: 'other', label: 'Other stuff' }
]

// The second marker. Ink stays the structure of the page — these only ever mark
// something that means something (a category, a price, a stamp), which is why
// the poster still reads as a poster. Hex, not tokens: the 3D headline needs
// real values to hand three.js, and the CSS reads the same list.
export const PALETTE = {
    ink: '#111111',
    red: '#dc3c28',
    blue: '#2b55d4',
    amber: '#e8a11c',
    green: '#2f9163'
}

// Mostly ink, with a letter here and there in another colour — as if the pen
// ran out mid-word and somebody grabbed whatever was nearest. A full rainbow
// headline stops reading as handwriting.
export const HEADLINE_PALETTE = [
    PALETTE.ink,
    PALETTE.ink,
    PALETTE.red,
    PALETTE.ink,
    PALETTE.blue,
    PALETTE.ink,
    PALETTE.ink,
    PALETTE.amber
]

export const STATUS = {
    available: { label: 'Take it', tone: 'available' },
    reserved: { label: 'On hold', tone: 'reserved' },
    sold: { label: 'Gone', tone: 'sold' }
}

/**
 * One entry per thing.
 *
 * photos: paths under `public/garage/`, e.g. '/garage/blue-armchair/1.jpg'.
 *         An empty list draws a placeholder frame instead of a broken image.
 * status: 'available' | 'reserved' | 'sold'
 *
 * Everything below is PLACEHOLDER content, written to shape the layout before
 * the real photos arrive. Replace it, do not add to it.
 */
export const ITEMS = [
    {
        id: 'wool-coat',
        title: 'Grey wool coat',
        price: 45,
        category: 'clothes',
        size: 'M',
        condition: 'Worn two winters, no holes',
        note: 'Warm enough for a real winter. Slightly too big for me, which is why I loved it.',
        photos: [],
        status: 'available'
    },
    {
        id: 'denim-jacket',
        title: 'Denim jacket',
        price: 25,
        category: 'clothes',
        size: 'L',
        condition: 'Faded on purpose, then faded more',
        note: 'One button replaced with a slightly wrong button. Nobody has ever noticed.',
        photos: [],
        status: 'available'
    },
    {
        id: 'desk-lamp',
        title: 'Anglepoise-ish desk lamp',
        price: 20,
        category: 'other',
        condition: 'Works, wobbles a bit',
        note: 'Has lit every exam I ever crammed for. Bulb included, obviously.',
        photos: [],
        status: 'reserved'
    },
    {
        id: 'record-player',
        title: 'Record player',
        price: 80,
        category: 'electronics',
        condition: 'Working, new needle last year',
        note: 'Belt drive, built-in preamp. Records not included — those are coming with me.',
        photos: [],
        status: 'available'
    },
    {
        id: 'kettle',
        title: 'Electric kettle',
        price: 10,
        category: 'electronics',
        condition: 'Boils water, does nothing else',
        note: 'The single most used object in this apartment.',
        photos: [],
        status: 'sold'
    },
    {
        id: 'yerevan-magnets',
        title: 'Fridge magnets, a whole flock',
        price: 5,
        category: 'souvenirs',
        condition: 'Fine, they are magnets',
        note: 'Twelve cities. Take the lot or pick your favourites, I am not counting.',
        photos: [],
        status: 'available'
    },
    {
        id: 'ceramic-cup',
        title: 'Hand-made ceramic cup',
        price: 12,
        category: 'souvenirs',
        condition: 'One chip on the base, invisible',
        note: 'Bought from the person who made it. Holds exactly one long coffee.',
        photos: [],
        status: 'available'
    },
    {
        id: 'floor-mirror',
        title: 'Tall floor mirror',
        price: 35,
        category: 'other',
        size: '150 × 40 cm',
        condition: 'Frame scuffed, glass perfect',
        note: 'Heavy. Bring a friend and a car, not a bicycle.',
        photos: [],
        status: 'available'
    }
]
