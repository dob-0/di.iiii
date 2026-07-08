// All authored content for taron-grigoryan's landing page lives here.
// Placeholder images sit in public/taron/ — swap the `image` paths when the
// real photographs arrive (keep roughly the same aspect ratios for the grid).

export const taronContent = {
    name: ['Taron', 'Grigoryan'],
    // Right-hand word column on the hero — his actual mediums.
    heroWords: [
        'Photography',
        'Film',
        'Sound',
        'Objects',
        'Miniatures',
        'Portraits',
        'Campaigns',
        'Light'
    ],
    statement: 'Every project begins with an idea, not a camera.',
    about: [
        'I’m Taron Grigoryan, a Munich-based visual artist working across photography, film, sound, and objects. I create images that balance precision with curiosity — from handcrafted miniature worlds to portraits, products, campaigns, and visual stories.',
        'Over the years I’ve had the chance to collaborate with brands including Versace, Teenage Engineering, Jägermeister, AIAIAI, Stylophone, Gulf and many more.'
    ],
    portrait: { src: '/taron/portrait.svg', alt: 'Portrait of Taron Grigoryan (placeholder)' },
    // Real photographs (Fuji X-T5, resized to 1600px webp). Each work also has
    // a 96px thumb in /taron/thumbs — those thumbs are the "pixels" that spell
    // the name on the landing cover. col/span scatter tiles on a 12-column grid;
    // ratio matches each file's true aspect (P = 1067/1600, L = 1600/1067).
    works: [
        { id: 'fxt58389', col: 2, span: 3, ratio: '1067 / 1600' },
        { id: 'fxt58410', col: 7, span: 2, ratio: '1067 / 1600' },
        { id: 'fxt58424', col: 11, span: 2, ratio: '1067 / 1600' },
        { id: 'fxt58432', col: 1, span: 2, ratio: '1067 / 1600' },
        { id: 'fxt58451', col: 5, span: 4, ratio: '1600 / 1067' },
        { id: 'fxt58498', col: 9, span: 4, ratio: '1600 / 1067' },
        { id: 'fxt58503', col: 3, span: 4, ratio: '1600 / 1067' },
        { id: 'fxt58511', col: 8, span: 3, ratio: '1067 / 1600' },
        { id: 'fxt58512', col: 1, span: 4, ratio: '1600 / 1067' },
        { id: 'fxt58521', col: 6, span: 2, ratio: '1067 / 1600' },
        { id: 'fxt58527', col: 10, span: 3, ratio: '1067 / 1600' },
        { id: 'fxt58540', col: 4, span: 3, ratio: '1067 / 1600' },
        { id: 'fxt58548', col: 8, span: 2, ratio: '1067 / 1600' },
        { id: 'fxt58555', col: 11, span: 2, ratio: '1067 / 1600' },
        { id: 'fxt58561', col: 2, span: 2, ratio: '1067 / 1600' },
        { id: 'fxt58609', col: 5, span: 4, ratio: '1600 / 1067' },
        { id: 'fxt58621', col: 10, span: 3, ratio: '1067 / 1600' },
        { id: 'fxt58666', col: 1, span: 3, ratio: '1067 / 1600' },
        { id: 'fxt58719', col: 7, span: 4, ratio: '1600 / 1067' },
        { id: 'fxt58724', col: 5, span: 2, ratio: '1067 / 1600' },
        { id: 'fxt58777', col: 9, span: 3, ratio: '1067 / 1600' },
        { id: 'fxt58811', col: 3, span: 3, ratio: '1067 / 1600' },
        { id: 'fxt58837', col: 8, span: 4, ratio: '1600 / 1067' },
        { id: 'fxt58842', col: 6, span: 3, ratio: '1067 / 1600' },
        { id: 'fxt58913', col: 1, span: 4, ratio: '1600 / 1067' }
    ].map((work, index) => ({
        ...work,
        image: `/taron/works/${work.id}.webp`,
        thumb: `/taron/thumbs/${work.id}.webp`,
        alt: `Photograph ${index + 1} by Taron Grigoryan`
    })),
    columns: [
        {
            heading: 'Collaborations',
            groups: [
                ['Versace', 'Teenage Engineering', 'Stylophone Dubreq', 'AIAIAI Audio'],
                ['Jägermeister', 'Gulf', 'Mechatronica', 'Rinse France']
            ]
        },
        {
            heading: 'Fields',
            groups: [
                ['Photography', 'Film', 'Sound design', 'Miniature worlds'],
                ['Music production', 'DJing', 'Lighting design'],
                ['3D printing', 'Industrial design', 'Acting']
            ]
        },
        {
            heading: 'Ventures',
            groups: [
                ['SPCTR Lights — founder', 'YOKOZO — founder'],
                ['MOCT Promo — art director', 'TUSHPA Lab — art director'],
                ['Mechatronica — resident', 'Gyumri State Drama Theater — actor']
            ]
        }
    ],
    indexHeading: 'Selected projects, performances & releases',
    // Name + year index, newest first (from Taron's CV).
    index: [
        { label: 'MOCT x Yellow Mellow Invites: Umwelt, Berlin', year: '2026' },
        { label: 'Constellations Vol. 3 — release (Mechatronica), Berlin', year: '2026' },
        { label: 'Mechatronica ‘Constellations Vol. 3’ release party, Berlin', year: '2026' },
        { label: 'TRESOR x MOCT, Yerevan', year: '2026' },
        { label: 'MOCT 7 w/ Kittin, Yerevan', year: '2026' },
        { label: 'Clubnight at HOW, Yerevan', year: '2026' },
        { label: 'MOCT x Gortsaran FM, Yerevan', year: '2026' },
        { label: 'Left Bank Clubnight, Tbilisi', year: '2026' },
        { label: 'Joyc • Seqta • Toko k B2B Giorgi Devadze • Alex Savage, Tbilisi', year: '2026' },
        { label: 'MEKICMEK NOR TARI, Yerevan', year: '2026' },
        { label: 'Lovefest, Vrnjačka Banja', year: '2025' },
        { label: 'ISLI Festival, Anaklia', year: '2025' },
        { label: 'MOCT w/ Héctor Oaks, SALOME, Nazira, Yerevan', year: '2025' },
        { label: 'MOCT x HÖR, Yerevan', year: '2025' },
        { label: 'MOCT x Mechatronica, Yerevan', year: '2025' },
        { label: 'Tombolo Club is Back w/ Regal86, Madrid', year: '2025' },
        { label: 'MTKVARZE presents: TaronX, BTX, OBRI, Tbilisi', year: '2025' },
        { label: 'UTØPIA with Identified Patient, Yerevan', year: '2025' },
        { label: 'TES x Garden — Tears in Club Radio launch, Tbilisi', year: '2025' },
        { label: 'MUTH, Yerevan', year: '2025' },
        { label: 'MOCT 6, Yerevan', year: '2025' },
        { label: 'HAYFILM audio-visual project, Yerevan', year: '2024' },
        { label: 'VAHAKNI audio-visual project, Yerevan', year: '2024' },
        { label: 'The Black Fountain audio-visual project, Yerevan', year: '2024' },
        { label: 'Neighbourhood Watch Vol. 5 — release (Crazed Behaviour), Bristol', year: '2024' },
        { label: 'SALOME, Istanbul', year: '2024' },
        { label: 'O3: Out of Office Festival, Dilijan', year: '2024' },
        { label: 'MOCT w/ Dr. Rubinstein, Hayfilm Cluster, Yerevan', year: '2024' },
        { label: 'MOCT 5, Hayfilm Cluster, Yerevan', year: '2024' },
        { label: 'Left Bank Resident Select, Tbilisi', year: '2024' },
        { label: 'Versace — music producer, Milan', year: '2023' },
        { label: 'Candyland EP — release (Ganzfeld Records), Amsterdam', year: '2023' },
        { label: 'Alpha Pendular — release (Ovelha Trax), Portugal', year: '2023' },
        { label: 'FAST & FURIOUS Vol. 1 — release (Wachita China), Buenos Aires', year: '2023' },
        { label: 'Art residency at PACT Zollverein, Essen', year: '2023' },
        { label: 'Spielart Festival, Munich', year: '2023' },
        { label: 'Rinse France, Paris', year: '2023' },
        { label: 'NOH Radio, Istanbul', year: '2023' },
        { label: 'MOCT w/ Rødhåd, Yerevan', year: '2023' },
        { label: 'SeenThat Ruins — exhibition, Yerevan', year: '2023' },
        { label: 'SPCTR — founder, curator, producer, Yerevan', year: '2022' },
        { label: 'MARDs art residency, Munich', year: '2022' },
        { label: 'Artbox Armenia — winner alumni, Yerevan', year: '2022' },
        { label: 'Secret Garden YP / Acid Arab / Bohemnots, Armenia', year: '2022' },
        { label: 'Korridorrr, do_or_die: Ossia (live), Yerevan', year: '2022' },
        { label: 'YBAF Fashion — lighting engineer, Yerevan', year: '2022' },
        { label: '“in Basen” Artworks For Peace, Basen', year: '2021' },
        { label: 'Ground art festival, Gyumri', year: '2021' },
        { label: 'technoSapien audio-visual performance, Gyumri', year: '2021' },
        { label: 'Loopdeville campout, Dilijan', year: '2021' },
        { label: 'Poligraf Yerevan — visual artist, DJ', year: '2021' },
        { label: 'Cyberglam / Grand Candy Patriot, Yerevan', year: '2021' },
        { label: 'seenThat — multimedia artist, Gyumri', year: '2019' },
        { label: '“Wedding in the Back”, Gyumri / Los Angeles', year: '2018' },
        { label: '“Patvi Hamar” Public TV — actor, Yerevan', year: '2017' },
        { label: '“Aratta” — lead guitarist', year: '2017' },
        { label: '“King Lir” — performance, Gyumri', year: '2016' }
    ],
    contact: {
        email: 'taronxdj@gmail.com',
        instagram: 'https://www.instagram.com/taronx_x_x',
        instagramLabel: 'Instagram',
        signoff: 'Idea first ✌'
    }
}
