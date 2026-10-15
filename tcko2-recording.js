export class PcmTakeCapture {
  constructor(rate, post, chunkFrames = 4096) {
    this.rate = rate;
    this.post = post;
    this.chunkFrames = chunkFrames;
    this.take = null;
  }
  start(id, maximumFrames = this.rate * 300) {
    if (this.take) this.stop('replaced');
    const limit = Math.min(Math.floor(maximumFrames), this.rate * 300);
    if (!Number.isSafeInteger(id) || !Number.isFinite(limit) || limit < 1) return;
    this.take = { id, frames: 0, used: 0, limit, buffer: new Int16Array(this.chunkFrames * 2) };
    this.post({ type: 'recordingStarted', id, rate: this.rate });
  }
  append(left, right) {
    if (!this.take) return;
    const take = this.take;
    const frames = Math.min(left.length, right.length, take.limit - take.frames);
    for (let frame = 0; frame < frames; frame++) {
      for (let channel = 0; channel < 2; channel++) {
        const value = channel === 0 ? left[frame] : right[frame];
        const safe = Number.isFinite(value) ? Math.max(-1, Math.min(1, value)) : 0;
        take.buffer[take.used++] = Math.round(safe * (safe < 0 ? 32768 : 32767));
      }
      take.frames++;
      if (take.used === take.buffer.length) this.flush();
    }
    if (take.frames >= take.limit) this.stop('limit');
  }
  flush() {
    const take = this.take;
    if (!take?.used) return;
    const buffer = take.used === take.buffer.length ? take.buffer.buffer : take.buffer.buffer.slice(0, take.used * 2);
    const frames = take.used / 2;
    take.buffer = new Int16Array(this.chunkFrames * 2); take.used = 0;
    this.post({ type: 'recordingChunk', id: take.id, frames, buffer }, [buffer]);
  }
  stop(reason = 'user') {
    if (!this.take) return;
    this.flush();
    const { id, frames } = this.take;
    this.take = null;
    this.post({ type: 'recordingFinished', id, frames, reason });
  }
}

export function encodeWav(chunks, rate) {
  if (!Number.isInteger(rate) || rate < 8000 || rate > 192000) throw new Error('Unsupported recording sample rate.');
  const bytes = chunks.reduce((total, chunk) => total + chunk.byteLength, 0);
  if (bytes % 4 !== 0 || bytes > 0xffffffff - 36) throw new Error('Invalid recording length.');
  const header = new ArrayBuffer(44), view = new DataView(header);
  const text = (offset, value) => { for (let index = 0; index < value.length; index++) view.setUint8(offset + index, value.charCodeAt(index)); };
  text(0, 'RIFF'); view.setUint32(4, bytes + 36, true); text(8, 'WAVE'); text(12, 'fmt ');
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 2, true);
  view.setUint32(24, rate, true); view.setUint32(28, rate * 4, true); view.setUint16(32, 4, true); view.setUint16(34, 16, true);
  text(36, 'data'); view.setUint32(40, bytes, true);
  return new Blob([header, ...chunks], { type: 'audio/wav' });
}
