import { encodeWav } from './tcko2-recording.js';

const MAXIMUM_BYTES = 96 * 1024 * 1024;
const duration = seconds => `${Math.floor(seconds / 60).toString().padStart(2, '0')}:${Math.floor(seconds % 60).toString().padStart(2, '0')}`;

export class TakeRecorder {
  constructor({ startAudio, isRunning, send }) {
    this.startAudio = startAudio; this.isRunning = isRunning; this.send = send;
    this.current = null; this.arming = false; this.nextId = 0; this.takes = [];
    this.record = document.getElementById('record-take');
    this.stopButton = document.getElementById('stop-recording');
    this.status = document.getElementById('recording-status');
    this.time = document.getElementById('recording-time');
    this.results = document.getElementById('take-results');
    this.select = document.getElementById('recorded-takes');
    this.download = document.getElementById('download-take');
    this.preview = document.getElementById('take-preview');
    this.clear = document.getElementById('clear-takes');
    this.record.addEventListener('click', () => this.start());
    this.stopButton.addEventListener('click', () => this.stop());
    this.select.addEventListener('change', () => this.selectTake());
    this.download.addEventListener('click', () => {
      const take = this.takes[this.select.selectedIndex];
      if (!take) return;
      take.downloaded = true;
      this.status.textContent = 'WAV download requested. In desktop TCK03, choose Import WAV to add it as a separate channel.';
    });
    this.clear.addEventListener('click', () => {
      if (this.current || this.arming || !window.confirm('Clear the takes kept in this browser tab? Download your WAVs first. Files already downloaded are not deleted.')) return;
      this.preview.pause(); this.preview.removeAttribute('src'); this.preview.load();
      for (const take of this.takes) URL.revokeObjectURL(take.url);
      this.takes = []; this.select.replaceChildren(); this.results.hidden = true;
      this.status.textContent = 'Browser takes cleared. Downloaded WAV files are unchanged.'; this.updateButtons();
    });
    window.addEventListener('beforeunload', event => {
      if (!this.current && !this.arming && !this.takes.some(take => !take.downloaded)) return;
      event.preventDefault(); event.returnValue = '';
    });
    this.updateButtons();
  }
  updateButtons() {
    const full = this.takes.reduce((total, take) => total + take.bytes, 0) >= MAXIMUM_BYTES - 44;
    this.record.disabled = this.arming || Boolean(this.current) || full;
    this.record.textContent = this.arming ? 'Starting…' : this.current ? '● Recording' : '● Record';
    this.record.setAttribute('aria-pressed', String(Boolean(this.current)));
    this.stopButton.disabled = !this.current || this.current.stopping;
    this.clear.disabled = !this.takes.length || this.arming || Boolean(this.current);
  }
  async start() {
    if (this.arming || this.current || this.record.disabled) return;
    this.arming = true; this.preview.pause(); this.updateButtons();
    this.status.textContent = 'Preparing a new take…';
    try {
      if (!await this.startAudio() || !this.isRunning()) throw new Error('Could not start audio. Play a key, then try Record again.');
      if (document.hidden) throw new Error('Keep the synth tab visible while recording.');
      const remainingBytes = MAXIMUM_BYTES - this.takes.reduce((total, take) => total + take.bytes, 0) - 44;
      this.current = { id: ++this.nextId, chunks: [], frames: 0, rate: 0, maximumFrames: Math.floor(remainingBytes / 4), stopping: false };
      this.send({ type: 'recordStart', id: this.current.id, maximumFrames: this.current.maximumFrames });
    } catch (error) { this.status.textContent = error.message || 'Could not start recording.'; }
    finally { this.arming = false; this.updateButtons(); }
  }
  handleMessage(data) {
    if (!data.type?.startsWith('recording')) return false;
    const take = this.current;
    if (!take || data.id !== take.id) return true;
    if (data.type === 'recordingStarted') {
      take.rate = data.rate; this.time.textContent = '00:00';
      this.status.textContent = 'Recording the synth, effects and Master level. Play your sound; stop after the echoes fade. Maximum 5 minutes per take.';
    } else if (data.type === 'recordingChunk') {
      if (data.buffer.byteLength !== data.frames * 4) { this.recover('Recording data was incomplete.'); return true; }
      take.chunks.push(data.buffer); take.frames += data.frames;
      this.time.textContent = duration(take.frames / take.rate);
    } else if (data.type === 'recordingFinished') {
      this.finish(data.frames === take.frames ? data.reason : 'partial');
    }
    return true;
  }
  stop(reason = 'user') {
    const take = this.current;
    if (!take) return Promise.resolve();
    if (take.stopping) return take.finished;
    take.stopping = true;
    take.finished = new Promise(resolve => { take.resolve = resolve; });
    this.status.textContent = 'Finishing the WAV take…'; this.updateButtons();
    take.timeout = setTimeout(() => { if (this.current === take) this.finish('partial'); }, 3000);
    this.send({ type: 'recordStop', id: take.id, reason });
    return take.finished;
  }
  recover(message) { if (this.current) { this.finish('partial'); this.status.textContent = `${message} Any received audio was kept as a partial take.`; } }
  finish(reason) {
    const take = this.current;
    if (!take) return;
    clearTimeout(take.timeout); this.current = null;
    try {
      if (!take.frames || !take.rate) { this.status.textContent = 'No audio frames were received. Try Record again.'; return; }
      const blob = encodeWav(take.chunks, take.rate);
      const name = `TCKO2-take-${new Date().toISOString().replace(/[:.]/g, '-')}-${String(take.id).padStart(2, '0')}${reason === 'partial' ? '-partial' : ''}.wav`;
      this.takes.push({ name, url: URL.createObjectURL(blob), bytes: blob.size, downloaded: false });
      this.select.add(new Option(`Take ${String(take.id).padStart(2, '0')} · ${duration(take.frames / take.rate)}${reason === 'partial' ? ' · partial' : ''}`, name));
      this.select.selectedIndex = this.takes.length - 1; this.results.hidden = false; this.selectTake();
      this.time.textContent = duration(take.frames / take.rate);
      this.status.textContent = reason === 'partial' ? 'Partial take kept. The final audio buffer may be missing; preview it before downloading.' : reason === 'limit' ? 'Take limit reached. Download the WAV; clear downloaded takes if you need more browser memory.' : reason === 'hidden' ? 'Recording stopped when you left the synth tab. Your WAV is ready to download.' : 'Take ready. Download WAV, then choose Import WAV in desktop TCK03. Earlier takes stay in the list.';
    } catch (error) { this.status.textContent = `Could not create the WAV: ${error.message}`; }
    finally { take.resolve?.(); this.updateButtons(); }
  }
  selectTake() {
    const take = this.takes[this.select.selectedIndex];
    if (!take) return;
    this.preview.pause(); this.preview.src = take.url;
    this.download.href = take.url; this.download.download = take.name;
    this.download.setAttribute('aria-label', `Download WAV: ${take.name}`);
  }
}
