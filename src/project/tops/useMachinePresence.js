import { useEffect, useState } from 'react'
import { acquireMachineLink, machinesIn } from './machineLink.js'
import { readMachineDevices } from './machineDevices.js'

/**
 * This page's presence on the desk: it tells the other machines it is here and
 * what its machine has, and hands back every machine the desk can see.
 *
 * @returns {{ machine: {id,name}|null, machines: Array<{id,name,self,devices,pages}>, link }}
 */
export function useMachinePresence(spaceId) {
    const [view, setView] = useState({ machine: null, machines: [], link: null })

    useEffect(() => {
        if (!spaceId) return undefined
        const { link, release } = acquireMachineLink(spaceId)
        let devices = []
        let peers = []
        let machine = null
        let cancelled = false
        const publish = () => { if (!cancelled) setView({ machine, machines: machinesIn(peers, machine, devices), link }) }
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
        return () => {
            cancelled = true
            off()
            media?.removeEventListener?.('devicechange', refresh)
            release()
        }
    }, [spaceId])

    return view
}
