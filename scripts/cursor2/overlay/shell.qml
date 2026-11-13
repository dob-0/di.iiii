// cursor2 overlay — draws the extra cursors as normal arrow pointers, one colour per slot.
// Click-through (empty input mask), overlay layer.
// Reads $XDG_RUNTIME_DIR/cursor2/pos.json written by cursor2.py:
//   {"cursors":[{"x":..,"y":..,"down":bool,"color":"#rrggbb"}, ...]}  (global logical coordinates)
// One window per screen; an arrow shows only on the screen that holds its point.
import QtQuick
import Quickshell
import Quickshell.Io
import Quickshell.Wayland

ShellRoot {
    property var cursors: []

    FileView {
        id: posFile
        path: (Quickshell.env("XDG_RUNTIME_DIR") || "/tmp") + "/cursor2/pos.json"
        watchChanges: true
        onFileChanged: reload()
        onLoaded: {
            try { cursors = JSON.parse(text()).cursors || [] } catch (err) {}
        }
    }

    Variants {
        model: Quickshell.screens
        PanelWindow {
            id: win
            required property var modelData
            screen: modelData
            WlrLayershell.layer: WlrLayer.Overlay
            WlrLayershell.namespace: "cursor2"
            WlrLayershell.exclusionMode: ExclusionMode.Ignore
            anchors { top: true; left: true; right: true; bottom: true }
            color: "transparent"
            mask: Region {}   // empty region: every click passes through

            Repeater {
                model: cursors
                Canvas {
                    id: arrow
                    required property var modelData
                    readonly property real lx: modelData.x - win.modelData.x
                    readonly property real ly: modelData.y - win.modelData.y
                    visible: lx >= 0 && ly >= 0 && lx < win.modelData.width && ly < win.modelData.height
                    x: lx; y: ly          // the arrow tip is the top-left corner = the point
                    width: 20; height: 28
                    scale: modelData.down ? 0.85 : 1.0   // slightly smaller while pressed
                    transformOrigin: Item.TopLeft
                    onModelDataChanged: requestPaint()
                    onPaint: {
                        const c = getContext("2d")
                        c.clearRect(0, 0, width, height)
                        c.beginPath()
                        // classic arrow outline, tip at (1,1)
                        c.moveTo(1, 1); c.lineTo(1, 22); c.lineTo(6, 17); c.lineTo(10, 26)
                        c.lineTo(14, 24); c.lineTo(10, 16); c.lineTo(17, 16); c.closePath()
                        c.fillStyle = modelData.color
                        c.fill()
                        c.lineWidth = 1.5
                        c.strokeStyle = "white"
                        c.stroke()
                    }
                }
            }
        }
    }
}
