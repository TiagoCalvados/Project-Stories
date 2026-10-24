export class PcmSoundFile {
  constructor(rate) { this.rate = rate; this.left = null; this.right = null; this.position = 0; this.playing = false; this.fade = 1; this.fadeStep = 0; }
  load(left, right, autoplay = true) {
    if (!(left instanceof Float32Array) || !(right instanceof Float32Array) || !left.length || left.length !== right.length || left.length > this.rate * 1800) return false;
    this.left = left; this.right = right; this.play(autoplay); return true;
  }
  play(enabled = true) { this.position = 0; this.playing = Boolean(enabled && this.left); this.fade = 1; this.fadeStep = 0; }
  stop() { this.playing = false; this.position = 0; }
  fadeOut(seconds) { this.fadeStep = 1 / (Math.max(1, seconds) * this.rate); }
  mix(left, right, master) {
    if (!this.playing) return;
    const gain = Math.max(0, Math.min(.8, master));
    for (let i = 0; i < left.length; i++) {
      if (this.position >= this.left.length || this.fade <= 0) { this.playing = false; break; }
      const l = this.left[this.position], r = this.right[this.position];
      left[i] = Math.max(-.95, Math.min(.95, left[i] + (Number.isFinite(l) ? l : 0) * gain * this.fade));
      right[i] = Math.max(-.95, Math.min(.95, right[i] + (Number.isFinite(r) ? r : 0) * gain * this.fade));
      this.position++; this.fade = Math.max(0, this.fade - this.fadeStep);
    }
    if (this.position >= this.left.length || this.fade <= 0) this.playing = false;
  }
  status() { return { type: 'soundFile', loaded: Boolean(this.left), playing: this.playing }; }
}
