function clamp(v, a, b) {
  return Math.max(a, Math.min(b, v));
}

export class SfxEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.noiseBuffer = null;
    this.masterVolume = 0.24;
  }

  ensure() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.masterVolume;
    this.master.connect(this.ctx.destination);
    this.noiseBuffer = this.createNoiseBuffer();
  }

  setMasterVolume(v = 0.24) {
    this.masterVolume = clamp(Number(v) || 0, 0, 1);
    if (this.master) this.master.gain.value = this.masterVolume;
  }

  createNoiseBuffer() {
    if (!this.ctx) return null;
    const len = Math.floor(this.ctx.sampleRate * 0.35);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    return buf;
  }

  unlock() {
    this.ensure();
    if (!this.ctx) return;
    if (this.ctx.state !== 'running') {
      this.ctx.resume().catch(() => {});
    }
  }

  attachUnlockListeners(target = window) {
    const unlockOnce = () => {
      this.unlock();
      target.removeEventListener('pointerdown', unlockOnce);
      target.removeEventListener('keydown', unlockOnce);
      target.removeEventListener('touchstart', unlockOnce);
    };
    target.addEventListener('pointerdown', unlockOnce, { passive: true });
    target.addEventListener('keydown', unlockOnce);
    target.addEventListener('touchstart', unlockOnce, { passive: true });
  }

  playCollision(impactForce = 0) {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;
    const t = clamp(impactForce / 320, 0, 1);

    // "Clack" metálico curto
    const click = this.ctx.createOscillator();
    const clickGain = this.ctx.createGain();
    click.type = 'square';
    click.frequency.setValueAtTime(220 + t * 420, now);
    click.frequency.exponentialRampToValueAtTime(90 + t * 90, now + 0.05);
    clickGain.gain.setValueAtTime(0.0001, now);
    clickGain.gain.exponentialRampToValueAtTime(0.09 + t * 0.12, now + 0.004);
    clickGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.07);
    click.connect(clickGain);
    clickGain.connect(this.master);
    click.start(now);
    click.stop(now + 0.08);

    // "Impact" de ruído com filtro
    if (this.noiseBuffer) {
      const noise = this.ctx.createBufferSource();
      const bp = this.ctx.createBiquadFilter();
      const ng = this.ctx.createGain();
      noise.buffer = this.noiseBuffer;
      bp.type = 'bandpass';
      bp.frequency.setValueAtTime(1200 + t * 1400, now);
      bp.Q.value = 1.2 + t * 2.4;
      ng.gain.setValueAtTime(0.0001, now);
      ng.gain.exponentialRampToValueAtTime(0.05 + t * 0.13, now + 0.006);
      ng.gain.exponentialRampToValueAtTime(0.0001, now + 0.09);
      noise.connect(bp);
      bp.connect(ng);
      ng.connect(this.master);
      noise.start(now);
      noise.stop(now + 0.1);
    }
  }

  playElimination(spinMax = 0) {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;
    const t = clamp(spinMax / 900, 0, 1);

    // Boom grave descendente
    const sub = this.ctx.createOscillator();
    const subGain = this.ctx.createGain();
    sub.type = 'sine';
    sub.frequency.setValueAtTime(130 + t * 70, now);
    sub.frequency.exponentialRampToValueAtTime(42, now + 0.35);
    subGain.gain.setValueAtTime(0.0001, now);
    subGain.gain.exponentialRampToValueAtTime(0.24 + t * 0.22, now + 0.02);
    subGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.42);
    sub.connect(subGain);
    subGain.connect(this.master);
    sub.start(now);
    sub.stop(now + 0.45);

    // Estalo/cauda de destruição
    if (this.noiseBuffer) {
      const noise = this.ctx.createBufferSource();
      const lp = this.ctx.createBiquadFilter();
      const ng = this.ctx.createGain();
      noise.buffer = this.noiseBuffer;
      lp.type = 'lowpass';
      lp.frequency.setValueAtTime(2000 + t * 1000, now);
      lp.frequency.exponentialRampToValueAtTime(180, now + 0.4);
      ng.gain.setValueAtTime(0.0001, now);
      ng.gain.exponentialRampToValueAtTime(0.16 + t * 0.14, now + 0.02);
      ng.gain.exponentialRampToValueAtTime(0.0001, now + 0.45);
      noise.connect(lp);
      lp.connect(ng);
      ng.connect(this.master);
      noise.start(now);
      noise.stop(now + 0.48);
    }
  }
}

