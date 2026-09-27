import { createContext } from 'react'

// Whether objects' links are live on this surface. Off by default: the same
// viewport (StudioViewport) draws the Studio editor, Open Jam and a visitor's
// view mode, and only the visitor's click should leave the room. A surface
// that shows a room to a visitor turns it on (PublicProjectSceneSurface via
// StudioViewport's `followLinks`; LiveProjectScene passes it directly).
export const EntityLinksContext = createContext(false)
