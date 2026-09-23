import { useMachinePresence } from '../../project/tops/useMachinePresence.js'
import { describeRigRows, useRigVisibility } from '../../rig/rigVisibility.js'

// The desk: every machine in this space, and what each one has.
//
// Two di.iiii installs linked by `di follow` are one desk. This is the window
// that shows it — a card per machine with its cameras, microphones, speakers
// and screens — and places the operator that uses a device, already set to run
// on the machine the device is plugged into. A machine appears while a di.iiii
// page is open on it (an editor, or the projector page of a kiosk).

const GROUPS = [
    { kind: 'camera', label: 'Cameras', place: 'top.camera', action: 'Camera In' },
    { kind: 'screen', label: 'Screens', place: 'top.out', action: 'Picture Out' },
    { kind: 'mic', label: 'Microphones' },
    { kind: 'speaker', label: 'Speakers' }
]

const describe = (device) => (device.kind === 'screen' && device.width ? `${device.label} · ${device.width}×${device.height}` : device.label)

export default function DeskPanelWindow({ spaceId, onPlace }) {
    const { machine, machines } = useMachinePresence(spaceId)
    // Whether the other di.iiii on this network can see this one — said on the
    // desk, where a person looks for the machines, and in the same quiet hint
    // style as the line under it (src/rig/rigVisibility.js).
    const rigRows = describeRigRows(useRigVisibility())

    if (!machine) {
        return (
            <div className="raw-desk-panel is-empty">
                <p>Finding the machines on this desk…</p>
            </div>
        )
    }

    return (
        <div className="raw-desk-panel">
            {rigRows.map((row) => (
                <p key={row.key} className="raw-desk-hint" data-rig-visibility={row.key}>{row.text}</p>
            ))}
            {machines.length < 2 ? (
                <p className="raw-desk-hint">
                    Only this machine so far. Another machine joins while a di.iiii page of this space is open on it.
                </p>
            ) : null}
            {machines.map((entry) => (
                <section key={entry.id} className={`raw-desk-machine${entry.self ? ' is-self' : ''}`}>
                    <header>
                        <strong>{entry.name}</strong>
                        <span>{entry.self ? 'this machine' : `${entry.pages} page${entry.pages === 1 ? '' : 's'} open`}</span>
                    </header>
                    {GROUPS.map((group) => {
                        const devices = (entry.devices || []).filter((device) => device.kind === group.kind)
                        if (!devices.length) return null
                        return (
                            <div key={group.kind} className="raw-desk-group">
                                <h4>{group.label}</h4>
                                <ul>
                                    {devices.map((device) => (
                                        <li key={`${device.kind}:${device.id}`}>
                                            <span>{describe(device)}</span>
                                            {group.place ? (
                                                <button
                                                    type="button"
                                                    onClick={() => onPlace?.(group.place, {
                                                        machine: entry.id,
                                                        ...(group.kind === 'camera' ? { device: device.id, deviceLabel: device.label } : {})
                                                    })}
                                                >
                                                    + {group.action}
                                                </button>
                                            ) : null}
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        )
                    })}
                </section>
            ))}
        </div>
    )
}
