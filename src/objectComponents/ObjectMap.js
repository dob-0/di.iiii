import BoxObject from './BoxObject.jsx'
import SphereObject from './SphereObject.jsx'
import ConeObject from './ConeObject.jsx'
import CylinderObject from './CylinderObject.jsx'
import Text3DObject from './Text3DObject.jsx'
import Text2DObject from './Text2DObject.jsx'
import ImageObject from './ImageObject.jsx'
import VideoObject from './VideoObject.jsx'
import AudioObject from './AudioObject.jsx'
import ModelObject from './ModelObject.jsx'

export const ObjectMap = {
    'box': BoxObject,
    'sphere': SphereObject,
    'cone': ConeObject,
    'cylinder': CylinderObject,
    'text-3d': Text3DObject,
    'text-2d': Text2DObject,
    'image': ImageObject,
    'video': VideoObject,
    'audio': AudioObject,
    'model': ModelObject,
}
