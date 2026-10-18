export class LoopControls {
  constructor({ startAudio, isRunning, send }) {
    this.startAudio = startAudio; this.isRunning = isRunning; this.send = send;
    const byId = id => document.getElementById(id);
    this.record = byId('loop-record'); this.play = byId('loop-play'); this.add = byId('loop-add'); this.clear = byId('loop-clear');
    this.volume = byId('loop-volume'); this.volumeValue = byId('loop-volume-value'); this.time = byId('loop-time'); this.status = byId('loop-status');
    this.state = { mode: 'empty', frames: 0, rate: 48000, overdub: false, passes: 0 };
    this.pending = false; this.generation = 0;
    this.record.addEventListener('click', () => {
      if (this.state.mode === 'recording') { this.send({ type: 'loop', action: 'finish' }); return; }
      if (this.state.frames > 0 && !window.confirm('Replace the current loop? Use Record and Download WAV first if you want to keep it.')) return;
      void this.command('record');
    });
    this.play.addEventListener('click', () => { void this.command('toggle'); });
    this.add.addEventListener('click', () => { void this.command('overdub'); });
    this.clear.addEventListener('click', () => {
      if (window.confirm('Clear this loop? Live notes and other recordings will not be deleted.')) this.send({ type: 'loop', action: 'clear' });
    });
    this.volume.addEventListener('input', () => { this.send({ type: 'loop', action: 'volume', value: Number(this.volume.value) / 100 }); this.volumeValue.textContent = `${this.volume.value}%`; });
    window.addEventListener('beforeunload', event => {
      if (!this.state.frames && this.state.mode !== 'recording') return;
      event.preventDefault(); event.returnValue = '';
    });
    this.render();
  }
  async command(action) {
    if (this.pending) return;
    const generation = this.generation;
    this.pending = true; this.render();
    try {
      if (!(await this.startAudio()) || !this.isRunning()) { this.status.textContent = 'Could not start audio. Play a key, then try the loop again.'; return; }
      if (generation !== this.generation) return;
      this.send({ type: 'loop', action });
      this.send({ type: 'loop', action: 'volume', value: Number(this.volume.value) / 100 });
    } finally { if (generation === this.generation) { this.pending = false; this.render(); } }
  }
  cancelPending() { this.generation++; this.pending = false; this.render(); }
  handleMessage(data) {
    if (data.type !== 'loopStatus') return false;
    const previous = this.state;
    this.state = data; this.render();
    if (previous.mode === data.mode && previous.overdub === data.overdub && previous.passes === data.passes && !data.reason) return true;
    this.status.textContent = data.reason === 'short' ? 'Too short: record at least a tenth of a second.' : data.mode === 'recording' ? 'Capturing live sound, not the playing loop. Press Loop it when ready · 30 seconds maximum.' : data.overdub ? 'Adding live sound for one loop cycle. The loop itself is not recorded again.' : data.mode === 'playing' ? `Loop playing · ${data.passes} recorded pass${data.passes === 1 ? '' : 'es'}. Change sounds or play freely over it.` : data.mode === 'paused' ? 'Loop paused and kept. Live keys still work; Play loop resumes it.' : 'Make loop → play a phrase → Loop it. Add layer records one more pass. Loop stays in this tab only.';
    return true;
  }
  render() {
    const { mode, frames, rate, overdub } = this.state, exists = frames > 0 && mode !== 'recording';
    this.record.textContent = mode === 'recording' ? '↻ Loop it' : exists ? '● New loop' : '● Make loop';
    this.record.setAttribute('aria-pressed', String(mode === 'recording')); this.record.disabled = this.pending;
    this.play.textContent = mode === 'playing' ? 'Pause loop' : 'Play loop'; this.play.disabled = !exists || this.pending;
    this.add.textContent = overdub ? 'Adding layer…' : '+ Add layer'; this.add.disabled = !exists || overdub || this.pending;
    this.add.setAttribute('aria-pressed', String(overdub)); this.clear.disabled = mode === 'empty' || this.pending;
    this.time.textContent = `${(frames / rate).toFixed(1)} s`;
  }
  recover() {
    if (this.state.frames || this.state.mode === 'recording') this.status.textContent = 'The sound engine stopped; the in-memory loop is unavailable. Reload to start a new loop.';
    this.record.disabled = this.play.disabled = this.add.disabled = this.clear.disabled = true;
  }
}
