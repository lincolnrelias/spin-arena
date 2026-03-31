import { Top } from '../top.js';
import { WAVE_POWER_SCALE } from '../physics.js';
import { hpRatio, drawDashedEnergyRing, drawCounterRing, drawRadialMotionStrokes } from '../spinVisual.js';
import { clamp } from '../utils.js';

export class Tremor extends Top {
  constructor(game, cfg) {
    super(game, cfg);
    this.ability = cfg.ability ?? {};
    this.waveCooldownDuration = this.ability.waveCooldown ?? 0.6;
    this.waveCooldown = 0;
  }

  onTick(dt) {
    if (this.waveCooldown > 0) this.waveCooldown -= dt;
  }

  onCollide(other, impactForce) {
    if (this.waveCooldown > 0) return;
    this.waveCooldown = this.waveCooldownDuration;
    this.game.spawnShockwave(this.x, this.y, impactForce * WAVE_POWER_SCALE, this.color);
  }

  onArenaBoundary(impactForce) {
    if (this.waveCooldown > 0) return;
    this.waveCooldown = this.waveCooldownDuration;
    this.game.spawnShockwave(this.x, this.y, impactForce * WAVE_POWER_SCALE, this.color);
  }

  renderSpinBackground(ctx) {
    super.renderSpinBackground(ctx);
    const hr = hpRatio(this);
    const t = this.game.time;
    drawDashedEnergyRing(ctx, this.radius, 'rgba(170,140,255,0.95)', hr, t, { inner: 0.63, direction: 1, alpha: 0.25 + hr * 0.38 });
    drawCounterRing(ctx, this.radius, 'rgba(200,180,255,0.45)', hr, t);
    drawRadialMotionStrokes(ctx, this.radius, 12, hr, '#dcd0ff');
  }

  renderBody(ctx) {
    // Corpo circular com padrão concêntrico
    ctx.beginPath();
    ctx.fillStyle = this.color;
    ctx.arc(0, 0, this.radius, 0, Math.PI * 2);
    ctx.fill();

    const hr = this.spinMax > 0 ? clamp(this.spin / this.spinMax, 0, 1) : 0;
    const pulse = (0.5 + 0.5 * Math.sin(this.game.time * 7)) * (0.45 + 0.55 * hr);
    for (let i = 0; i < 4; i++) {
      const rr = this.radius * (0.25 + i * 0.18);
      ctx.strokeStyle = `rgba(180,160,255,${0.1 + hr * 0.12 + pulse * 0.1})`;
      ctx.lineWidth = Math.max(1, 2 - i * 0.3);
      ctx.beginPath();
      ctx.arc(0, 0, rr, 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.strokeStyle = 'rgba(255,255,255,0.18)';
    ctx.lineWidth = 3;
    ctx.stroke();
  }
}

