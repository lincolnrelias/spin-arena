import { Top } from '../top.js';
import { SPIN_TRANSFER_RATIO } from '../physics.js';
import { hpRatio, drawDashedEnergyRing, drawCounterRing, drawRadialMotionStrokes, drawVertexSparkles } from '../spinVisual.js';

export class Espelho extends Top {
  constructor(game, cfg) {
    super(game, cfg);
    this.ability = cfg.ability ?? {};
    this.reflectRatio = this.ability.reflectBase ?? 0.55;
    this.reflectStep = this.ability.reflectStep ?? 0.05;
    this.reflectCap = this.ability.reflectCap ?? 0.85;
    this.flashDuration = this.ability.flashDuration ?? 0.1;
    this.reflectCount = 0;
    this.flashTimer = 0;
  }

  onCollide(other, impactForce) {
    // "Ao receber dano": tentamos refletir apenas quando este é o mais fraco.
    if (!(this.spin < other.spin)) return;

    const reflected = impactForce * this.reflectRatio;
    other.spin -= reflected * SPIN_TRANSFER_RATIO;
    this.spin += reflected * SPIN_TRANSFER_RATIO * 0.2;

    this.reflectCount++;
    if (this.reflectCount % 3 === 0) {
      this.reflectRatio = Math.min(this.reflectRatio + this.reflectStep, this.reflectCap);
    }
    this.flashTimer = this.flashDuration;
    this.game.spawnReflectFlash(this.x, this.y, this.radius);
  }

  onTick(dt) {
    if (this.flashTimer > 0) this.flashTimer -= dt;
  }

  renderSpinBackground(ctx) {
    super.renderSpinBackground(ctx);
    const hr = hpRatio(this);
    const t = this.game.time;
    const ice = '#b8e8ff';
    drawDashedEnergyRing(ctx, this.radius, ice, hr, t, { inner: 0.68, direction: 1, alpha: 0.28 + hr * 0.38 });
    drawCounterRing(ctx, this.radius, 'rgba(220,245,255,0.75)', hr, t);
    drawRadialMotionStrokes(ctx, this.radius, 6, hr, '#e8f8ff');
    drawVertexSparkles(ctx, this.radius, 6, hr, 'rgba(255,255,255,0.95)', t, { direction: 1 });
  }

  renderBody(ctx) {
    // Hexágono "prateado".
    const r = this.radius;
    const pts = 6;
    ctx.beginPath();
    for (let i = 0; i < pts; i++) {
      const a = (Math.PI * 2 * i) / pts;
      const px = Math.cos(a) * r;
      const py = Math.sin(a) * r;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();

    ctx.fillStyle = this.color;
    ctx.fill();

    const flashA = this.flashTimer > 0 ? this.flashTimer / this.flashDuration : 0;
    ctx.strokeStyle = flashA > 0 ? `rgba(255,255,255,${0.35 + flashA * 0.65})` : 'rgba(210,240,255,0.65)';
    ctx.lineWidth = 3;
    ctx.stroke();

    // Facetas especulares (leitura de giro no corpo)
    const hr = this.spinMax > 0 ? this.spin / this.spinMax : 0;
    const spec = 0.2 + hr * 0.45 + flashA * 0.35;
    ctx.strokeStyle = `rgba(255,255,255,${spec})`;
    ctx.lineWidth = 2;
    for (let e = 0; e < 3; e++) {
      const a0 = (Math.PI * 2 * e) / 3;
      const a1 = a0 + Math.PI / 3;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a0) * r * 0.88, Math.sin(a0) * r * 0.88);
      ctx.lineTo(Math.cos(a1) * r * 0.88, Math.sin(a1) * r * 0.88);
      ctx.stroke();
    }
  }
}

