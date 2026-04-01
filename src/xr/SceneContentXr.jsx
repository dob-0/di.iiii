import { Suspense } from 'react'
import { XR } from '@react-three/xr'
import ExperienceXr from './ExperienceXr.jsx'

export default function SceneContentXr({ xrStore }) {
    return (
        <XR store={xrStore}>
            <Suspense fallback={null}>
                <ExperienceXr />
            </Suspense>
        </XR>
    )
}
