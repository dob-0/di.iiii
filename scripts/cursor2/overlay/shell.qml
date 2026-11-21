// cursor2 overlay — draws the second cursor. Click-through (empty input mask), overlay layer.
// Reads $XDG_RUNTIME_DIR/cursor2/pos.json written by cursor2.py: {"x":..,"y":..,"down":bool} in
// global logical coordinates. One small window per screen; it only shows on the screen holding the point.
import QtQuick
import Quickshell
import Quickshell.Io
import Quickshell.Wayland

ShellRoot {
    property real px: -1
    property real py: -1
    property bool down: false

    FileView {
        id: posFile
        path: (Quickshell.env("XDG_RUNTIME_DIR") || "/tmp") + "/cursor2/pos.json"
        watchChanges: true
        onFileChanged: reload()
        onLoaded: {
            try {
                const o = JSON.parse(text())
                px = o.x; py = o.y; down = o.down
            } catch (err) {}
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

            readonly property real lx: px - modelData.x
            readonly property real ly: py - modelData.y
            readonly property bool here: lx >= 0 && ly >= 0 && lx < modelData.width && ly < modelData.height

            Rectangle {
                visible: win.here
                x: win.lx; y: win.ly
                width: 16; height: 16
                radius: 8
                color: down ? "#ff4f9a" : "#2fd0ff"   // pink while pressed, cyan otherwise
                border.color: "white"; border.width: 2
            }
        }
    }
}
