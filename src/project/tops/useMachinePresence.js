import { useEffect, useState } from 'react'
import { acquireMachineLink, machinesIn } from './machineLink.js'
import { readMachineDevices } from './machineDevices.js'
import { presentNdiSources, watchNdiScan } from '../../map/ndiLink.js'

// The names in a scan that are on the network now, as one comparable string.
const ndiKey = (scan) => presentNdiSources(scan).map((source) => source.name).sort().join('\n')

/**
 * This page's presence on the desk: it tells the other machines it is here and
 * what its machine has, and hands back every machine the desk can see.
 *
 * NDI® sources are kept current by the server's autoscan (ndiLink.watchNdiScan):
 * when one appears on the network or leaves it, this machine's device list is read
 * again and the next hello carries it to every other machine on the desk.
 *
 * @param {string} spaceId
 * @param {{ ndi?: 'stream' | 'poll' }} [options]  'poll' for a page whose
 *   connections belong to its pictures (the wall) — see watchNdiScan.
 * @returns {{ machine: {id,name}|null, machines: Array<{id,name,self,devices,pages}>, link, ndiScan: object|null }}
 *   ndiScan — THIS machine's scan as its server reports it, or null where the
 *   server has no NDI lane at all (a hosted tier)
 */
export function useMachinePresence(spaceId, { ndi = 'stream' } = {}) {
    const [view, setView] = useState({ machine: null, machines: [], link: null, ndiScan: null })

    useEffect(() => {
        if (!spaceId) return undefined
        const { link, release } = acquireMachineLink(spaceId)
        let devices = []
        let peers = []
        let machine = null
        let ndiScan = null
        let cancelled = false
        const publish = () => { if (!cancelled) setView({ machine, machines: machinesIn(peers, machine, devices), link, ndiScan }) }
        const off = link.onPeers((nextPeers, nextMachine) => {
            peers = nextPeers
            machine = nextMachine
            publish()
        })
        const refresh = () => readMachineDevices().then((list) => {
            if (cancelled) return
            devices = list
            link.setDevices(list)
            publish()
        })
        refresh()
        const media = globalThis.navigator?.mediaDevices
        media?.addEventListener?.('devicechange', refresh)
        const stopNdi = watchNdiScan((scan) => {
            const changed = ndiKey(scan) !== ndiKey(ndiScan)
            ndiScan = scan
            // The device list is only read again when the set of names moved; a scan
            // that only changed state (starting → running) is just shown.
            if (changed) refresh()
            else publish()
        }, { mode: ndi })
        return () => {
            cancelled = true
            off()
            stopNdi()
            media?.removeEventListener?.('devicechange', refresh)
            release()
        }
    }, [spaceId, ndi])

    return view
}
