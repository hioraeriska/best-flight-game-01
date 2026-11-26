// audio.js — synthesised engine, wind and chimes. No audio files, no network.
export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.engineOsc = null;
    this.engineGain = null;
    this.windGain = null;
    this.windSrc = null;
  }
  ensure() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    // Engine: two detuned saws through a low-pass filter.
    this.engineOsc = this.ctx.createOscillator();
    this.engineOsc.type = 'sawtooth';
    this.engineOsc.frequency.value = 55;
    const osc2 = this.ctx.createOscillator();
    osc2.type = 'sawtooth';
    osc2.frequency.value = 55 * 1.5;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 320;
    this.engineGain = this.ctx.createGain();
    this.engineGain.gain.value = 0;
    this.engineOsc.connect(filter);
    osc2.connect(filter);
    filter.connect(this.engineGain);
    this.engineGain.connect(this.ctx.destination);
    this.engineOsc.start();
    osc2.start();
    this.engineOsc2 = osc2;
    // Wind: looped noise buffer through a band-pass.
    const len = this.ctx.sampleRate * 2;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    this.windSrc = this.ctx.createBufferSource();
    this.windSrc.buffer = buf;
    this.windSrc.loop = true;
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 700;
    bp.Q.value = 0.6;
    this.windGain = this.ctx.createGain();
    this.windGain.gain.value = 0;
    this.windSrc.connect(bp);
    bp.connect(this.windGain);
    this.windGain.connect(this.ctx.destination);
    this.windSrc.start();
  }
  setFlight(throttle, speed, airborne) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const base = 42 + throttle * 68 + speed * 0.22;
    this.engineOsc.frequency.setTargetAtTime(base, t, 0.08);
    this.engineOsc2.frequency.setTargetAtTime(base * 1.5, t, 0.08);
    this.engineGain.gain.setTargetAtTime(airborne ? 0.05 + throttle * 0.05 : 0.03 + throttle * 0.05, t, 0.1);
    this.windGain.gain.setTargetAtTime(Math.min(0.09, speed * 0.0009), t, 0.15);
  }
  blip(freq, dur, type, vol) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    o.type = type || 'sine';
    o.frequency.value = freq;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol || 0.16, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g);
    g.connect(this.ctx.destination);
    o.start(t);
    o.stop(t + dur);
  }
  ring() { this.blip(880, 0.28, 'sine', 0.2); setTimeout(() => this.blip(1318, 0.4, 'sine', 0.18), 90); }
  touchdown() { this.blip(140, 0.25, 'triangle', 0.25); }
  crash() {
    this.blip(90, 0.7, 'sawtooth', 0.22);
    setTimeout(() => this.blip(55, 0.9, 'sawtooth', 0.2), 120);
  }
  click() { this.blip(660, 0.06, 'square', 0.08); }
  toggleMute() {
    this.muted = !this.muted;
    if (this.ctx) {
      const t = this.ctx.currentTime;
      this.engineGain.gain.setTargetAtTime(0, t, 0.05);
      this.windGain.gain.setTargetAtTime(0, t, 0.05);
    }
    return this.muted;
  }
}
