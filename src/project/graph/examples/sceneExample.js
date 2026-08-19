// A scene, made the way a person would make one: a room, a light, a shape, and
// a place to put your own file.
//
// This exists because the owner said, twice, "i still cannot connect and
// understand how work" and then "i want to create scene with the objects i mean
// cube light or i want upload mine". Every piece of it was already possible and
// none of it was legible. A worked example you can open, look at and copy is the
// answer to that — not another feature.
//
// It is built to be READ. The note says the three moves in plain words, the
// nodes are labelled by what they ARE rather than by their type, and the Model
// node is deliberately left empty so the empty state is the one you meet with
// instructions next to it rather than alone.

import { createEdge, createNode } from '../../nodeRegistry.js'

const COL = 320
const ROW = 140
// How far below the workspace top the two seeded windows reach. Cards start
// below it: the surface dodges top-docked windows, but only if there is a band
// to dodge into — the starter workspace had to learn this twice.
const WINDOW_BAND = 300

export const SCENE_EXAMPLE_CUBE_COLOR = '#ff8a3d'

const HOW = `A room, with things standing in it.

· double-tap the canvas → add a cube
· drag your own .glb onto the canvas
· drag dot to dot to wire two cards
· press › on a card to go inside it`

/**
 * Build the scene example.
 *
 * Returns { nodes, edges } ready for createNode/createEdge ops. Pure apart from
 * node id generation.
 */
export function buildSceneExample({ parentId = null, workspaceTop = 160 } = {}) {
    const made = new Map()
    const cardTop = workspaceTop + WINDOW_BAND
    const add = (key, typeId, { label, col, row, values = {} } = {}) => {
        const node = createNode(typeId, {
            label,
            graphX: col * COL,
            graphY: cardTop + row * ROW,
            values,
            parentId
        })
        if (node) made.set(key, node)
        return node
    }
    const id = (key) => made.get(key)?.id || ''
    const wire = (fromKey, fromPort, toKey, toPort) => {
        const from = id(fromKey)
        const to = id(toKey)
        return from && to ? createEdge(from, fromPort, to, toPort) : null
    }

    // The room itself, open so the scene is visible the moment it is made.
    add('world', 'universe.world', {
        label: 'The room',
        col: 2,
        row: 0,
        values: {
            title: 'The room',
            bgColor: '#0b2330',
            frame: { x: 512, y: 88, width: 560, height: 330, visible: true, zIndex: 7 }
        }
    })

    add('how', 'view.text', {
        label: 'How to build this',
        col: 0,
        row: 0,
        values: {
            content: HOW,
            frame: { x: 24, y: 88, width: 470, height: 330, visible: true, zIndex: 8 }
        }
    })

    // A light, so the room is lit rather than flat. Its own defaults are fine;
    // it exists here so that "type light, pick it" has something to point at.
    add('light', 'world.light', {
        label: 'The light',
        col: 0,
        row: 2,
        values: {
            ambientColor: '#ffffff',
            ambientIntensity: 0.55,
            directionalColor: '#fff3e2',
            directionalIntensity: 1.1,
            directionalPosition: [4, 8, 3]
        }
    })

    add('colour', 'value.color', {
        label: 'A colour',
        col: 0,
        row: 3,
        values: { value: SCENE_EXAMPLE_CUBE_COLOR }
    })

    add('cube', 'geom.cube', {
        label: 'A cube',
        col: 1,
        row: 2,
        values: {
            size: [0.7, 0.7, 0.7],
            position: [-0.7, 0.35, 0],
            rotation: [0, 0.5, 0]
        }
    })

    // Deliberately EMPTY. A model node with no file renders nothing, which is
    // exactly the state a person meets after placing one — better met here,
    // beside an instruction, than alone on a blank canvas.
    add('model', 'geom.model', {
        label: 'Your own model goes here',
        col: 1,
        row: 3,
        values: {
            src: '',
            position: [0.9, 0, 0],
            rotation: [0, -0.4, 0],
            scale: [1, 1, 1]
        }
    })

    const edges = [
        // The one wire, chosen because its effect is unmissable: change the
        // colour and the cube changes with it.
        wire('colour', 'out', 'cube', 'color')
    ].filter(Boolean)

    return { nodes: [...made.values()], edges }
}
