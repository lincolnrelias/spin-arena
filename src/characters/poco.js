import { Top } from '../top.js';
import { hpRatio, drawDashedEnergyRing, drawRadialMotionStrokes, drawSpiralEnergy } from '../spinVisual.js';

export class Poco extends Top {
  constructor(game, cfg) {
    super(game, cfg);
    this.ability = cfg.ability ?? {};
    this.gravityRadius = this.ability.gravityRadius ?? 180;
    this.gravityStrength = this.ability.gravityStrength ?? 8000;
    this.selfSpeedMult = this.ability.selfSpeedMult ?? 0.7;
    // Tradeoff: Poço é mais lento.
    this.vx *= this.selfSpeedMult;
    this.vy *= this.selfSpeedMult;
  }

  onTick(dt) {
    for (const other of this.game.tops) {
      if (other === this || !other.alive) continue;
      const dx = this.x - other.x;
      const dy = this.y - other.y;
      const distSq = dx * dx + dy * dy;
      const dist = Math.sqrt(distSq);
      if (dist > this.gravityRadius || dist < this.radius) continue;
      const force = this.gravityStrength / distSq;
      const nx = dx / dist;
      const ny = dy / dist;
      other.vx += nx * force * dt;
      other.vy += ny * force * dt;
    }
  }

  renderSpinBackground(ctx) {
    super.renderSpinBackground(ctx);
    const hr = hpRatio(this);
    const t = this.game.time;
    const teal = 'rgba(80,220,200,0.9)';
    drawDashedEnergyRing(ctx, this.radius, teal, hr, t, { inner: 0.64, direction: -1, alpha: 0.2 + hr * 0.38 });
    drawSpiralEnergy(ctx, this.radius, hr, t, 'rgba(120,255,230,0.75)', { turns: 1.1, r0: 0.18, r1: 0.78, direction: 1 });
    drawRadialMotionStrokes(ctx, this.radius, 20, hr, '#a0ffe8');
  }

  renderExtras(ctx) {
    // 3 anéis pontilhados concêntricos
    const t = this.game.time;
    ctx.save();
    ctx.globalAlpha = 0.12;
    ctx.strokeStyle = this.color;
    ctx.setLineDash([2, 7]);
    ctx.lineWidth = 2;
    for (let i = 0; i < 3; i++) {
      const rr = this.radius * (1.3 + i * 0.55);
      const rot = (i % 2 === 0 ? 1 : -1) * t * (0.12 + i * 0.05);
      ctx.beginPath();
      ctx.arc(0, 0, rr, rot, rot + Math.PI * 2);
      ctx.stroke();
    }
    ctx.setLineDash([]);

    // Setas pontilhadas para alvos na zona
    ctx.globalAlpha = 0.18;
    for (const other of this.game.tops) {
      if (other === this || !other.alive) continue;
      const dx = this.x - other.x;
      const dy = this.y - other.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > this.gravityRadius || dist < this.radius) continue;
      const nx = dx / (dist || 1);
      const ny = dy / (dist || 1);
      const len = 22;
      // desenha no sistema local (0,0 = Poço)
      ctx.strokeStyle = this.color;
      ctx.setLineDash([5, 6]);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(-nx * 6, -ny * 6);
      ctx.lineTo(nx * len, ny * len);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.restore();
  }

  renderBody(ctx) {
    // Corpo circular + brilho
    ctx.beginPath();
    ctx.fillStyle = this.color;
    ctx.arc(0, 0, this.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(140,255,220,0.22)';
    ctx.lineWidth = 3;
    ctx.stroke();
  }
}

