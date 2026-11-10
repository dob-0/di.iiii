import { createContext, useContext } from 'react'

// What the Inspector's Screen rows can do without Studio's shell having to
// carry three more props: open Projection, open the deck in Perform, turn the
// selected file-video into a Screen. StudioEditor provides it; with no
// provider the rows render nothing, so the Inspector stays usable alone.
export const ScreenActionsContext = createContext(null)
export const useScreenActions = () => useContext(ScreenActionsContext)
