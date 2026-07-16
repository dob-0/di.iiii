import React from 'react'

// No React error boundary existed anywhere in the app (audit finding #20) —
// currently masked by good try/catch discipline inside individual asset
// loaders (ModelObject/ImageObject/PrimitiveMaterial all degrade to a
// placeholder on a load failure), but nothing protects against an
// unexpected *synchronous* throw during render. Without a boundary, React
// unmounts everything up to the nearest one — which is the app root — so
// one bad entity blanks the entire viewport for every other object too.
// Wrapping each entity individually means a single bad one renders nothing
// instead of taking the whole scene down with it.
export default class SceneEntityErrorBoundary extends React.Component {
    constructor(props) {
        super(props)
        this.state = { hasError: false }
    }

    static getDerivedStateFromError() {
        return { hasError: true }
    }

    componentDidCatch(error, info) {
        console.error('[SceneEntityErrorBoundary] entity render failed, skipping just this one:', error, info)
    }

    componentDidUpdate(prevProps) {
        // A different entity id (or a retry) gets a fresh chance to render
        // instead of staying permanently blanked for the rest of the session.
        if (this.state.hasError && prevProps.resetKey !== this.props.resetKey) {
            this.setState({ hasError: false })
        }
    }

    render() {
        if (this.state.hasError) return null
        return this.props.children
    }
}
