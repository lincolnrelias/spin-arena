import { Top } from '../top.js';
import { lerp, clamp } from '../utils.js';
import { hpRatio, drawDashedEnergyRing, drawCounterRing, drawRadialMotionStrokes } from '../spinVisual.js';

export class Coroa extends Top {
  constructor(game, cfg) {
    super(game, cfg);
    this.ability = cfg.ability ?? {};

    this.baseSpinMax = this.spinMax;
    this.baseMass = this.mass;
    this.baseRadius = this.radius;
    this.stackInterval = this.ability.stackInterval ?? 8;
    this.massPerStack = this.ability.massPerStack ?? 0.02;
    this.spinMaxPerStack = this.ability.spinMaxPerStack ?? 0.01;
    this.radiusPerStack = this.ability.radiusPerStack ?? 0.005;
    this.radiusCapMult = this.ability.radiusCapMult ?? 1.2;
    this.flashDuration = this.ability.flashDuration ?? 0.22;

    // Persistência simples: eliminações acumuladas em sessionStorage.
    const persisted = Number(sessionStorage.getItem('topsroyale_coroa_elims') ?? '0');
    this.stacks = Math.max(0, persisted);

    this.baseStacksLockedForFirstMatch = true; // se persisted=0, naturalmente começa sem stacks.
    this.stackTimer = 0;
    this.stackFlashTimer = 0;

    this.recalculateStatsFromStacks(this.stacks, { keepRatio: true });
  }

  recalculateStatsFromStacks(stacks, { keepRatio }) {
    const oldSpinMax = this.spinMax;
    const ratio = oldSpinMax > 0 ? this.spin / oldSpinMax : 1;

    this.mass = this.baseMass * (1 + this.massPerStack * stacks);
    this.spinMax = this.baseSpinMax * (1 + this.spinMaxPerStack * stacks);
    const radiusMult = clamp(1 + this.radiusPerStack * stacks, 1, this.radiusCapMult);
    this.radius = this.baseRadius * radiusMult;
    this.hpMax = this.spinMax;

    if (keepRatio) this.spin = ratio * this.spinMax;
    this.hp = this.spin;
  }

  gainStack() {
    this.stacks++;
    this.recalculateStatsFromStacks(this.stacks, { keepRatio: true });
    this.stackFlashTimer = this.flashDuration;
    this.game.spawnCrownFlash(this.x, this.y, this.color);
  }

  onTick(dt) {
    if (this.dead) return;

    this.stackTimer += dt;
    if (this.stackTimer >= this.stackInterval) {
      this.stackTimer -= this.stackInterval;
      this.gainStack();
    }

    if (this.stackFlashTimer > 0) this.stackFlashTimer -= dt;
  }

  renderSpinBackground(ctx) {
    super.renderSpinBackground(ctx);
    const hr = hpRatio(this);
    const t = this.game.time;
    const gold = '#f0b030';
    drawDashedEnergyRing(ctx, this.radius, gold, hr, t, { inner: 0.64, direction: 1, alpha: 0.26 + hr * 0.42 });
    drawCounterRing(ctx, this.radius, 'rgba(255,230,160,0.5)', hr, t);
    const ticks = 12 + Math.min(this.stacks ?? 0, 12);
    drawRadialMotionStrokes(ctx, this.radius, ticks, hr, '#ffe8a8');
  }

  onDeath() {
    // Reseta stacks ao morrer.
    this.stacks = 0;
    this.stackTimer = 0;
    this.recalculateStatsFromStacks(0, { keepRatio: false });
  }

  renderBody(ctx) {
    // corpo
    ctx.beginPath();
    ctx.fillStyle = this.color;
    ctx.arc(0, 0, this.radius, 0, Math.PI * 2);
    ctx.fill();

    // coroa desenhada acima (height e pontos pelo número de stacks)
    const stacks = clamp(this.stacks, 0, 24);
    if (stacks > 0) {
      const baseY = -this.radius * 1.02;
      const tierH = 6;
      const totalH = stacks * 5;

      const flashA = this.stackFlashTimer > 0 ? clamp(this.stackFlashTimer / this.flashDuration, 0, 1) : 0;

      for (let i = 0; i < Math.min(stacks, 8); i++) {
        const y = baseY - i * tierH;
        const w = this.radius * (0.62 + i * 0.02);
        ctx.save();
        ctx.translate(0, y);
        ctx.beginPath();
        // triângulo pontiagudo
        ctx.moveTo(-w * 0.35, 8);
        ctx.lineTo(0, -2);
        ctx.lineTo(w * 0.35, 8);
        ctx.closePath();
        ctx.fillStyle = `rgba(232,160,32,${0.85 + flashA * 0.15})`;
        ctx.fill();
        ctx.strokeStyle = `rgba(255,240,180,${0.35 + flashA * 0.45})`;
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.restore();
      }

      // anel/halo sutil
      ctx.strokeStyle = `rgba(255,220,120,${0.1 + flashA * 0.45})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, -this.radius * 0.7, this.radius * (0.35 + stacks * 0.01), 0, Math.PI * 2);
      ctx.stroke();
    }

    // contorno
    ctx.strokeStyle = 'rgba(255,210,130,0.35)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, 0, this.radius, 0, Math.PI * 2);
    ctx.stroke();
  }
}

