// The live-port status vocabulary — RAW_WORKSPACE.md §5.1.
//
// `liveOutputs` carries a node's real-world value, but until now it carried no
// notion of WHY a port has nothing: a denied permission, a missing local
// install and an idle node all read as an empty string. That is the
// silent-failure class 43 of the 134 known fixes fall into, so the states are
// named once, here, rather than each device node inventing its own words.
export const PORT_STATUS = {
    IDLE: 'idle',            // nothing has asked it to do anything yet
    STARTING: 'starting',    // asking for access, opening a socket
    LIVE: 'live',            // working
    DENIED: 'denied',        // the person said no, or the OS did
    UNAVAILABLE: 'unavailable', // this HOST cannot — a browser asked for OSC
    ERROR: 'error'           // it tried and failed
}

// What a card shows. Deliberately full sentences: the audience for these is
// somebody mid-build wondering why a light did not move, and "unavailable" on
// its own has never once answered that question.
export const PORT_STATUS_TEXT = {
    [PORT_STATUS.IDLE]: 'Idle',
    [PORT_STATUS.STARTING]: 'Connecting…',
    [PORT_STATUS.LIVE]: 'Live',
    [PORT_STATUS.DENIED]: 'Refused by this di.iiii',
    [PORT_STATUS.UNAVAILABLE]: 'Needs a di.iiii running on this machine',
    [PORT_STATUS.ERROR]: 'Failed'
}

export const isPortWorking = (status) => status === PORT_STATUS.LIVE
