// A read-back of the Body source picture that does not stop the page (pilot 2, 2026-11-11).
// gl.readPixels into an array waits until the graphics process has finished everything queued before it
// (25 ms a call measured with two windows open). Here the read goes into a PIXEL_PACK_BUFFER, a fence is
// put behind it, and later frames ask `clientWaitSync(sync, 0, 0)` (never waits) until it is signalled; only
// then the bytes are copied out with getBufferSubData. WebGL2 only: on a WebGL1 context createMatteReadback
// returns null and the engine keeps its blocking read.

/**
 * @param {WebGL2RenderingContext} gl
 * @returns {null | { start(): boolean, poll(dst: Uint8Array): boolean, pending(): boolean, failed(): boolean, cancel(): void, dispose(): void }}
 */
export const createMatteReadback = (gl, width, height) => {
    if (!gl || typeof gl.fenceSync !== 'function' || typeof gl.clientWaitSync !== 'function' || typeof gl.getBufferSubData !== 'function') return null
    const bytes = width * height * 4
    let buffer = null
    let sync = null
    let broken = false

    const lost = () => { try { return gl.isContextLost?.() === true } catch { return true } }
    const dropSync = () => {
        if (!sync) return
        try { gl.deleteSync(sync) } catch { /* context gone */ }
        sync = null
    }
    const fail = () => { broken = true; dropSync() }

    return {
        pending: () => sync !== null,
        failed: () => broken,
        /** Start a read of the bound framebuffer. False: nothing started (one is pending, or the context cannot do it). */
        start() {
            if (broken || sync || lost()) return false
            try {
                if (!buffer) {
                    buffer = gl.createBuffer()
                    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, buffer)
                    gl.bufferData(gl.PIXEL_PACK_BUFFER, bytes, gl.STREAM_READ)
                } else {
                    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, buffer)
                }
                gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, 0)
                const fence = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0)
                gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null)
                if (!fence) { fail(); return false }
                sync = fence
                gl.flush()
                return true
            } catch {
                try { gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null) } catch { /* gone */ }
                fail()
                return false
            }
        },
        /** True and `dst` filled when the pending read is complete. Never waits. */
        poll(dst) {
            if (!sync) return false
            try {
                const status = gl.clientWaitSync(sync, 0, 0)
                if (status === gl.TIMEOUT_EXPIRED) return false
                if (status !== gl.ALREADY_SIGNALED && status !== gl.CONDITION_SATISFIED) { fail(); return false }
                dropSync()
                gl.bindBuffer(gl.PIXEL_PACK_BUFFER, buffer)
                gl.getBufferSubData(gl.PIXEL_PACK_BUFFER, 0, dst, 0, bytes)
                gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null)
                return true
            } catch {
                try { gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null) } catch { /* gone */ }
                fail()
                return false
            }
        },
        /** Forget a pending read (the source changed, the service went away): its bytes are never used. */
        cancel: dropSync,
        dispose() {
            dropSync()
            if (buffer) { try { gl.deleteBuffer(buffer) } catch { /* gone */ } buffer = null }
        }
    }
}
