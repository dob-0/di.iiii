import LiveProjectScene from '../../components/LiveProjectScene.jsx'
import './scene.css'

const WCC_PROJECT_ID = 'wcc-landing'

export default function WccExhibition({ onExit }) {
    return (
        <div className="wcc-scene">
            <LiveProjectScene
                projectId={WCC_PROJECT_ID}
                interactive
                showChrome
                onExit={onExit}
                title="WCC · Women Creating Change"
            />
        </div>
    )
}
