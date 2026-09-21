## 2026-09-21 — di.iiii can be a picture source, not only a screen

The NDI lane received and never sent. The koffi binding had `sendCreate`/`sendVideo`
from the day it was written, but the only thing that ever called them was
`devSender.js`, a CLI test pattern — there was no way for a picture di.iiii drew to
leave the machine. This branch gives it one, from the operator a person patches down
to the bytes on the wire.

**What it is for, and what it is not for.** On a di.iiii rig the patch already travels:
the document replicates and the machine at the wall runs the same operators and draws
them natively, at full quality, with no encoding anywhere. This lane is for the machine
that *cannot* run the patch, and for the programs that are not di.iiii — Resolume, OBS,
a media server, somebody else's rig. It makes di.iiii a source in anyone's setup.

- **A "Send Out" operator** (`top.send`) ends a picture chain and names it. No name, no
  sending — the empty default costs exactly what `top.out` costs. It is called Send Out
  and not "NDI Out" on purpose: naming a feature after NDI is the one thing the
  trademark terms do not allow, so the wire protocol is named beside the box instead,
  with the Vizrt line and the ndi.video link the licence requires.
- **A text parameter** — the first one in the TOP vocabulary. Every other parameter is a
  number the shader reads as `p_<name>`; a text one is metadata, and it is safe because
  `topEngine.js` already skips any parameter the shader does not declare a uniform for.
- **`pictureOut.js`** posts one JPEG at a time to the machine's own serverXR. At most one
  request is in flight per output and frames that arrive meanwhile are dropped, so the
  response is the throttle: a slow machine sends fewer frames rather than drifting
  further behind. Only a node that runs on THIS machine sends from it, so two machines
  on a rig never both broadcast the same name.
- **`sendManager.js` + `sendWorker.js`** mirror the receive lane's manager and child,
  copied rather than shared — the two lanes drift for good reasons and a common base
  would make every change to one a risk to the other. The structural difference is that
  an output has one publisher and no subscribers, so there is no ref-counting: it is born
  from its first frame and closes after five seconds of silence, because a page that is
  closed simply stops posting and no browser has a close beacon worth trusting.

### What was measured, not assumed

On `win` (NDI 6.3.2.0), the send lane broadcasting while the same machine's installed
di.iiii received it back through the real runtime: 631 frames, 0 dropped, 0 decode
errors, JPEG decode 3.23 ms a frame, `NDIlib_send_send_video_v2` 0.59 ms, the picture
pulled back as an 8 691-byte JPEG, and the viewer count reading 2 with a receiver
attached and 0 either side of it. **The send is free; the JPEG decode is the whole
cost** — the mirror image of the receive lane, where the encode was.

The same session closed two things the NDI doc had carried as never-seen since it was
written: a live NDI picture through di.iiii at all (200 `image/jpeg`, 41 KB), and
whether the multipart stream repeats (77 parts in 6 s, boundaries intact).

### Two traps worth keeping

- **`pushFrame` used to answer `ok` on a machine with no runtime**, opening an output and
  dropping every frame. It is the one failure a page could never see for itself: it would
  post thirty frames a second believing it was on the network. It now refuses before an
  output is created, naming the missing runtime. Two guards cover it, both watched red.
- **A sender started over ssh on Windows dies with the session.** Win32-OpenSSH tears the
  process tree down, so a source started in one `ssh` call is gone before the next one
  looks for it — which reads exactly like a discovery failure and cost an hour. Start the
  sender and probe it in the same session.

### Still open

aylmo has no NDI runtime, so it can neither send nor receive natively yet; the only NDI
binary on it is the Windows DLL inside TouchDesigner's Wine prefix, which Linux cannot
load. `avahi` is already running. The runtime is Vizrt's, under its own EULA, and we
never ship it — on Arch it is the AUR `ndi-sdk`, or `distroav`, which pulls it in and
gives OBS an NDI plugin too. Until it is installed there, the browser half has been
proven as far as the POST and its refusal, and the native half has been proven on `win`.
