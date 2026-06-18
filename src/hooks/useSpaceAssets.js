import { useState, useEffect, useCallback } from 'react'
import { listServerSpaceAssets } from '../services/serverSpaces.js'

export default function useSpaceAssets(spaceId) {
    const [assets, setAssets] = useState([])
    const refresh = useCallback(() => {
        if (!spaceId) return
        listServerSpaceAssets(spaceId).then(setAssets).catch(() => {})
    }, [spaceId])
    useEffect(() => { refresh() }, [refresh])
    return { assets, refresh }
}
