import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'

import {
    II_RUNTIME_ID,
    RUNTIME_SCHEMA_VERSION,
    defaultIiRuntimeDefinition,
    defaultRuntimeEntrypoint,
    defaultRuntimeRegistration,
    defaultRuntimeSnapshot,
    defaultRuntimeRegistry,
    getRuntimeDefinition,
    listRuntimeDefinitions,
    normalizeRuntimeAssetRef,
    normalizeRuntimeBinding,
    normalizeRuntimeCapabilityState,
    normalizeRuntimeCommand,
    normalizeRuntimeDefinition,
    normalizeRuntimeEvent,
    normalizeRuntimeRegistration,
    normalizeRuntimeRegistry
    ,
    normalizeRuntimeSnapshot
} from './runtimeSchema.js'

const require = createRequire(import.meta.url)
const runtimeSchemaCjs = require('../../shared/runtimeSchema.cjs')

describe('runtimeSchema', () => {
    it('normalizes runtime definitions with filtered enums and stable defaults', () => {
        const definition = normalizeRuntimeDefinition({
            runtimeId: 'ii',
            family: 'ii',
            label: 'ii Live Runtime',
            version: '0.1.0',
            executionKind: 'bad-value',
            runtimeClass: 'project-runtime',
            supportedHosts: ['linux', 'linux', '', 'mac'],
            capabilities: ['mapping', 'mapping', 'midi', ''],
            nodeTypes: ['ii.output', 'ii.output', 'ii.mapper'],
            surfaces: ['world', 'controller', 'bad-surface'],
            transports: ['local-socket', 'bad-transport', 'websocket'],
            assetKinds: ['mapping', 'shader', 'bad-kind'],
            entrypoint: {
                kind: 'local-process',
                command: ['python3', '-m', 'ii_runtime']
            }
        })

        expect(definition).toEqual({
            schemaVersion: RUNTIME_SCHEMA_VERSION,
            runtimeId: 'ii',
            family: 'ii',
            label: 'ii Live Runtime',
            version: '0.1.0',
            executionKind: 'worker',
            runtimeClass: 'project-runtime',
            supportedHosts: ['linux', 'mac'],
            capabilities: ['mapping', 'midi'],
            nodeTypes: ['ii.output', 'ii.mapper'],
            surfaces: ['world', 'controller'],
            transports: ['local-socket', 'websocket'],
            assetKinds: ['mapping', 'shader'],
            entrypoint: {
                kind: 'local-process',
                command: ['python3', '-m', 'ii_runtime']
            }
        })
    })

    it('normalizes runtime binding, command, event, capability, and asset shapes', () => {
        expect(normalizeRuntimeBinding({
            bindingId: 'bind_01',
            runtimeId: 'ii',
            projectId: 'ritual-show',
            spaceId: 'main',
            nodeIds: ['node_a', 'node_a', '', 'node_b'],
            edgeIds: ['edge_a'],
            assetRefs: ['asset_1', 'asset_1'],
            surfaceRefs: ['surface_main'],
            config: { profile: 'live-show' },
            documentVersion: '42',
            issuedAt: '100'
        })).toEqual({
            bindingId: 'bind_01',
            runtimeId: 'ii',
            projectId: 'ritual-show',
            spaceId: 'main',
            nodeIds: ['node_a', 'node_b'],
            edgeIds: ['edge_a'],
            assetRefs: ['asset_1'],
            surfaceRefs: ['surface_main'],
            config: { profile: 'live-show' },
            documentVersion: 42,
            issuedAt: 100
        })

        expect(normalizeRuntimeCommand({
            commandId: 'cmd_01',
            runtimeId: 'ii',
            projectId: 'ritual-show',
            type: 'runtime.bind-project',
            payload: { interactive: true },
            issuedAt: '5'
        })).toEqual({
            commandId: 'cmd_01',
            runtimeId: 'ii',
            projectId: 'ritual-show',
            type: 'runtime.bind-project',
            payload: { interactive: true },
            issuedAt: 5
        })

        expect(normalizeRuntimeEvent({
            eventId: 'evt_01',
            runtimeId: 'ii',
            projectId: 'ritual-show',
            type: 'runtime.ready',
            payload: { sessionId: 'ii_session_01' },
            emittedAt: '9'
        })).toEqual({
            eventId: 'evt_01',
            runtimeId: 'ii',
            projectId: 'ritual-show',
            type: 'runtime.ready',
            payload: { sessionId: 'ii_session_01' },
            emittedAt: 9
        })

        expect(normalizeRuntimeCapabilityState({
            runtimeId: 'ii',
            sessionId: 'ii_session_01',
            hostInfo: { platform: 'linux' },
            available: ['mapping', 'mapping', 'midi'],
            unavailable: ['artnet', 'artnet'],
            degraded: ['projector-output']
        })).toEqual({
            runtimeId: 'ii',
            sessionId: 'ii_session_01',
            hostInfo: { platform: 'linux' },
            available: ['mapping', 'midi'],
            unavailable: ['artnet'],
            degraded: ['projector-output']
        })

        expect(normalizeRuntimeAssetRef({
            assetId: 'asset_img_1',
            kind: 'image',
            mimeType: 'image/png',
            url: '/serverXR/api/projects/ritual-show/assets/asset_img_1',
            source: 'server',
            checksum: 'sha256:abc123',
            variants: { preview: '/preview.png' }
        })).toEqual({
            assetId: 'asset_img_1',
            kind: 'image',
            mimeType: 'image/png',
            url: '/serverXR/api/projects/ritual-show/assets/asset_img_1',
            source: 'server',
            checksum: 'sha256:abc123',
            variants: { preview: '/preview.png' }
        })

        expect(normalizeRuntimeRegistration({
            registrationId: 'reg_01',
            runtimeId: 'ii',
            sessionId: 'ii_session_01',
            projectId: 'ritual-show',
            spaceId: 'main',
            bindingId: 'bind_01',
            transport: 'local-socket',
            status: 'ready',
            hostInfo: { platform: 'linux' },
            capabilities: { runtimeId: 'ii', available: ['mapping'] },
            registeredAt: '11'
        })).toEqual({
            registrationId: 'reg_01',
            runtimeId: 'ii',
            sessionId: 'ii_session_01',
            projectId: 'ritual-show',
            spaceId: 'main',
            bindingId: 'bind_01',
            transport: 'local-socket',
            status: 'ready',
            hostInfo: { platform: 'linux' },
            capabilities: {
                runtimeId: 'ii',
                sessionId: '',
                hostInfo: {},
                available: ['mapping'],
                unavailable: [],
                degraded: []
            },
            registeredAt: 11
        })

        expect(normalizeRuntimeSnapshot({
            snapshotId: 'snap_01',
            runtimeId: 'ii',
            sessionId: 'ii_session_01',
            projectId: 'ritual-show',
            bindingId: 'bind_01',
            transportState: 'connected',
            activeMode: 'STORM',
            palette: 'BLOOD',
            bpm: '140',
            blackout: 1,
            metrics: { fps: 28 },
            mapping: { activePresetId: 'venue-main' },
            inputs: { midi: true },
            outputs: { projector: 'ok' },
            snapshotAt: '12'
        })).toEqual({
            snapshotId: 'snap_01',
            runtimeId: 'ii',
            sessionId: 'ii_session_01',
            projectId: 'ritual-show',
            bindingId: 'bind_01',
            transportState: 'connected',
            activeMode: 'STORM',
            palette: 'BLOOD',
            bpm: 140,
            blackout: true,
            metrics: { fps: 28 },
            mapping: { activePresetId: 'venue-main' },
            inputs: { midi: true },
            outputs: { projector: 'ok' },
            snapshotAt: 12
        })
    })

    it('keeps the cjs mirror aligned for the core normalization paths', () => {
        const input = {
            runtimeId: 'ii',
            family: 'ii',
            label: 'ii Live Runtime',
            executionKind: 'worker',
            runtimeClass: 'project-runtime',
            supportedHosts: ['linux'],
            capabilities: ['mapping', 'midi'],
            nodeTypes: ['ii.output'],
            surfaces: ['world', 'controller'],
            transports: ['local-socket'],
            assetKinds: ['mapping'],
            entrypoint: {
                kind: 'local-process',
                command: ['python3', '-m', 'ii_runtime']
            }
        }

        expect(runtimeSchemaCjs.RUNTIME_SCHEMA_VERSION).toBe(RUNTIME_SCHEMA_VERSION)
        expect(runtimeSchemaCjs.defaultRuntimeEntrypoint).toEqual(defaultRuntimeEntrypoint)
        expect(runtimeSchemaCjs.normalizeRuntimeDefinition(input)).toEqual(normalizeRuntimeDefinition(input))
        expect(runtimeSchemaCjs.normalizeRuntimeBinding({
            bindingId: 'bind_01',
            runtimeId: 'ii',
            projectId: 'p',
            spaceId: 's'
        })).toEqual(normalizeRuntimeBinding({
            bindingId: 'bind_01',
            runtimeId: 'ii',
            projectId: 'p',
            spaceId: 's'
        }))
        expect(runtimeSchemaCjs.normalizeRuntimeCommand({
            commandId: 'cmd_01',
            runtimeId: 'ii',
            type: 'runtime.start'
        })).toEqual(normalizeRuntimeCommand({
            commandId: 'cmd_01',
            runtimeId: 'ii',
            type: 'runtime.start'
        }))
        expect(runtimeSchemaCjs.normalizeRuntimeEvent({
            eventId: 'evt_01',
            runtimeId: 'ii',
            type: 'runtime.ready'
        })).toEqual(normalizeRuntimeEvent({
            eventId: 'evt_01',
            runtimeId: 'ii',
            type: 'runtime.ready'
        }))
        expect(runtimeSchemaCjs.normalizeRuntimeCapabilityState({ runtimeId: 'ii', available: ['mapping'] })).toEqual(
            normalizeRuntimeCapabilityState({ runtimeId: 'ii', available: ['mapping'] })
        )
        expect(runtimeSchemaCjs.normalizeRuntimeAssetRef({ assetId: 'asset_1', kind: 'image' })).toEqual(
            normalizeRuntimeAssetRef({ assetId: 'asset_1', kind: 'image' })
        )
        expect(runtimeSchemaCjs.normalizeRuntimeRegistration({
            registrationId: 'reg_01',
            runtimeId: 'ii'
        })).toEqual(normalizeRuntimeRegistration({
            registrationId: 'reg_01',
            runtimeId: 'ii'
        }))
        expect(runtimeSchemaCjs.normalizeRuntimeSnapshot({
            snapshotId: 'snap_01',
            runtimeId: 'ii'
        })).toEqual(normalizeRuntimeSnapshot({
            snapshotId: 'snap_01',
            runtimeId: 'ii'
        }))
    })

    it('exposes a normalized default ii runtime registry and lookup helpers', () => {
        const registry = normalizeRuntimeRegistry({
            runtimes: [
                defaultIiRuntimeDefinition,
                {
                    runtimeId: 'custom-runtime',
                    family: 'custom',
                    label: 'Custom Runtime',
                    executionKind: 'external-service',
                    runtimeClass: 'adapter',
                    supportedHosts: ['linux', 'windows'],
                    transports: ['websocket'],
                    entrypoint: { kind: 'http', url: 'http://127.0.0.1:9000' }
                },
                {
                    runtimeId: II_RUNTIME_ID,
                    family: 'duplicate'
                }
            ]
        })

        expect(defaultRuntimeRegistry.runtimes[0].runtimeId).toBe(II_RUNTIME_ID)
        expect(registry.runtimes.map((runtime) => runtime.runtimeId)).toEqual([II_RUNTIME_ID, 'custom-runtime'])
        expect(getRuntimeDefinition(registry, II_RUNTIME_ID)).toEqual(registry.runtimes[0])
        expect(getRuntimeDefinition(registry, 'missing-runtime')).toBeNull()
        expect(listRuntimeDefinitions(registry)).toEqual(registry.runtimes)

        expect(runtimeSchemaCjs.II_RUNTIME_ID).toBe(II_RUNTIME_ID)
        expect(runtimeSchemaCjs.defaultIiRuntimeDefinition).toEqual(defaultIiRuntimeDefinition)
        expect(runtimeSchemaCjs.defaultRuntimeRegistry).toEqual(defaultRuntimeRegistry)
        expect(runtimeSchemaCjs.defaultRuntimeRegistration).toEqual(defaultRuntimeRegistration)
        expect(runtimeSchemaCjs.defaultRuntimeSnapshot).toEqual(defaultRuntimeSnapshot)
        expect(runtimeSchemaCjs.normalizeRuntimeRegistry({
            runtimes: [defaultIiRuntimeDefinition]
        })).toEqual(normalizeRuntimeRegistry({
            runtimes: [defaultIiRuntimeDefinition]
        }))
        expect(runtimeSchemaCjs.getRuntimeDefinition(defaultRuntimeRegistry, II_RUNTIME_ID)).toEqual(
            getRuntimeDefinition(defaultRuntimeRegistry, II_RUNTIME_ID)
        )
        expect(runtimeSchemaCjs.listRuntimeDefinitions(defaultRuntimeRegistry)).toEqual(
            listRuntimeDefinitions(defaultRuntimeRegistry)
        )
    })
})
