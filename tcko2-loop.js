const bounded = value => Number.isFinite(value) ? Math.max(-1, Math.min(1, value)) : 0;
const mix = value => Math.abs(value) <= .9 ? value : Math.sign(value) * (.9 + .1 * Math.tanh((Math.abs(value) - .9) * 10));

export class AudioLoop {
  constructor(rate, post = () => {}, maximumSeconds = 30) {
    this.rate = rate;
    this.post = post;
    this.maximumFrames = Math.round(rate * Math.max(.1, Math.min(30, maximumSeconds)));
    this.left = new Float32Array(this.maximumFrames); this.right = new Float32Array(this.maximumFrames);
    this.edgeFrames = Math.max(1, Math.round(rate * .005));
    this.smoothing = 1 - Math.exp(-1 / (rate * .005));
    this.volume = 1;
    this.clear();
  }
  clear() {
    this.length = this.recorded = this.position = this.overdubRemaining = this.passes = 0;
    this.recording = this.playing = false;
    this.gain = this.fadeFrames = this.fadeStep = 0; this.fadeGain = 1;
    this.notify();
  }
  start() {
    this.clear(); this.recording = true; this.notify();
  }
  finish(play = true) {
    if (!this.recording) return;
    this.recording = false;
    this.length = this.recorded >= this.rate * .1 ? this.recorded : 0;
    this.position = 0; this.playing = play && this.length > 0; this.passes = this.length ? 1 : 0;
    this.notify(this.length ? this.recorded === this.maximumFrames ? 'limit' : '' : 'short');
  }
  toggle() {
    if (this.recording || !this.length) return;
    if (this.playing) this.pause();
    else { this.playing = true; this.fadeFrames = 0; this.fadeGain = 1; this.notify(); }
  }
  pause(immediate = false) {
    if (this.recording) this.finish(false);
    this.playing = false; this.overdubRemaining = this.fadeFrames = 0;
    if (immediate) this.gain = 0;
    this.notify();
  }
  overdub() {
    if (this.recording || !this.length || this.overdubRemaining) return;
    this.playing = true; this.fadeFrames = 0; this.fadeGain = 1;
    this.overdubRemaining = this.length; this.notify();
  }
  setVolume(value) { this.volume = Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0; }
  fadeOut(seconds) {
    if (!this.playing) return;
    this.fadeFrames = Math.round(this.rate * Math.max(1, Math.min(12, seconds || 3)));
    this.fadeStep = this.fadeGain / this.fadeFrames;
  }
  cancelFade() { this.fadeFrames = 0; }
  notify(reason = '') { this.post({ ...this.status(), reason }); }
  status() {
    return { type: 'loopStatus', mode: this.recording ? 'recording' : this.length ? this.playing ? 'playing' : 'paused' : 'empty', frames: this.recording ? this.recorded : this.length, position: this.position, overdub: this.overdubRemaining > 0, passes: this.passes, rate: this.rate, maximumFrames: this.maximumFrames };
  }
  process(left, right) {
    let peak = 0;
    for (let frame = 0; frame < left.length; frame++) {
      const liveLeft = bounded(left[frame]), liveRight = bounded(right[frame]);
      left[frame] = liveLeft; right[frame] = liveRight;
      const capturing = this.recording;
      if (this.recording) {
        this.left[this.recorded] = liveLeft; this.right[this.recorded++] = liveRight;
        if (this.recorded === this.maximumFrames) this.finish();
      }
      this.gain += ((this.playing ? this.volume : 0) - this.gain) * this.smoothing;
      if (this.gain < .000001 && !this.playing) this.gain = 0;
      if (this.fadeFrames > 0) {
        this.fadeGain = Math.max(0, this.fadeGain - this.fadeStep);
        if (--this.fadeFrames === 0) { this.fadeGain = 0; this.pause(true); }
      } else if (this.playing && this.fadeGain < 1) this.fadeGain += (1 - this.fadeGain) * this.smoothing;
      if (!capturing && this.length && (this.playing || this.gain > 0)) {
        if (this.overdubRemaining > 0) {
          const edge = Math.min(1, (this.length - this.overdubRemaining + 1) / this.edgeFrames, this.overdubRemaining / this.edgeFrames);
          if (liveLeft !== 0) this.left[this.position] = mix(this.left[this.position] + liveLeft * edge);
          if (liveRight !== 0) this.right[this.position] = mix(this.right[this.position] + liveRight * edge);
          if (--this.overdubRemaining === 0) { this.passes++; this.notify(); }
        }
        const edge = Math.min(1, (this.position + 1) / this.edgeFrames, (this.length - this.position) / this.edgeFrames);
        const gain = this.gain * this.fadeGain * edge;
        left[frame] = mix(liveLeft + this.left[this.position] * gain);
        right[frame] = mix(liveRight + this.right[this.position] * gain);
        this.position = (this.position + 1) % this.length;
      }
      peak = Math.max(peak, Math.abs(left[frame]), Math.abs(right[frame]));
    }
    return peak;
  }
}
