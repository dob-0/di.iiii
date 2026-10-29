import { useSyncExternalStore } from 'react'
import { lampTypesLoadedCount, onLampTypeLoaded } from './lampType.js'

// A Lamp's patch and dmx read its type file, which loads on demand. A graph context is rebuilt when the
// document or the clock moves; with no Time node the clock is a constant, so nothing else would make the graph
// read a Lamp again when its type arrives. Put this number in the dependencies of every graph-context memo.
export const useLampTypeVersion = () => useSyncExternalStore(onLampTypeLoaded, lampTypesLoadedCount, lampTypesLoadedCount)
