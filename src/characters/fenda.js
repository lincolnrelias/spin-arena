import { Top } from '../top.js';
import { clamp } from '../utils.js';
import { hpRatio, drawDashedEnergyRing, drawRadialMotionStrokes, drawSpiralEnergy } from '../spinVisual.js';

export class Fenda extends Top {
  constructor(game, cfg) {
    super(game, cfg);
    this.ability = cfg.ability ?? {};
    this.generation = cfg.generation ?? 0;
    this.hasSplit = false;
    this.maxGeneration = this.ability.maxGeneration ?? 2;
    this.splitHpThreshold = this.ability.splitHpThreshold ?? 0.3;
    this.splitSpinMult = this.ability.splitSpinMult ?? 0.5;
    this.splitMassMult = this.ability.splitMassMult ?? 0.5;
    this.splitRadiusMult = this.ability.splitRadiusMult ?? 0.7;
    this.splitSpeedMult = this.ability.splitSpeedMult ?? 0.6;
  }

  onTick(dt) {
    if (this.dead) return;
    if (this.hasSplit) return;
    if (this.generation >= this.maxGeneration) return;

    const ratio = this.spinMax > 0 ? this.spin / this.spinMax : 0;
    if (ratio < this.splitHpThreshold) this.split();
  }

  split() {
    if (this.hasSplit) return;
    this.hasSplit = true;

    const angle = Math.atan2(this.vy, this.vx);
    const perpX = -Math.sin(angle);
    const perpY = Math.cos(angle);
    const speed = Math.sqrt(this.vx * this.vx + this.vy * this.vy);

    const childSpinMax = this.spinMax * this.splitSpinMult;
    const childMass = this.mass * this.splitMassMult;
    const childRadius = this.radius * this.splitRadiusMult;

    const nemesis = this.lastDamageSource;

    this.game.spawnFendaChild(+1, {
      parentX: this.x,
      parentY: this.y,
      parentVx: this.vx,
      parentVy: this.vy,
      childGeneration: this.generation + 1,
      nemesis,
      childSpinMax,
      childMass,
      childRadius,
      perpX,
      perpY,
      speed,
      splitSpeedMult: this.splitSpeedMult,
      parentRadius: this.radius
    });
    this.game.spawnFendaChild(-1, {
      parentX: this.x,
      parentY: this.y,
      parentVx: this.vx,
      parentVy: this.vy,
      childGeneration: this.generation + 1,
      nemesis,
      childSpinMax,
      childMass,
      childRadius,
      perpX,
      perpY,
      speed,
      splitSpeedMult: this.splitSpeedMult,
      parentRadius: this.radius
    });

    // O "top principal" some sem encerrar a rodada (é uma mecânica de habilidade).
    this.game.spawnFendaSplitExplosion(this.x, this.y, this.color);
    this.alive = false;
    this.remove = true;
    this.spin = 0;
    this.vx = 0;
    this.vy = 0;
  }

  renderSpinBackground(ctx) {
    super.renderSpinBackground(ctx);
    const hr = hpRatio(this);
    const t = this.game.time;
    const pink = 'rgba(255,150,190,0.9)';
    drawDashedEnergyRing(ctx, this.radius, pink, hr, t, { inner: 0.69, direction: -1, alpha: 0.24 + hr * 0.36 });
    drawSpiralEnergy(ctx, this.radius, hr, t, 'rgba(255,200,220,0.95)', { turns: 1.4, direction: -1 });
    drawRadialMotionStrokes(ctx, this.radius, 10, hr, '#ffd0e0');
  }

  renderBody(ctx) {
    // Corpo oval "rachado"
    ctx.beginPath();
    ctx.fillStyle = this.color;
    const rx = this.radius * 0.95;
    const ry = this.radius * 0.78;
    ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = 'rgba(255,190,210,0.22)';
    ctx.lineWidth = 3;
    ctx.stroke();

    const hpRatio = this.spinMax > 0 ? this.spin / this.spinMax : 0;
    const crackT = clamp((0.70 - hpRatio) / 0.30, 0, 1); // cresce abaixo de 70%
    if (crackT > 0) {
      const lineLen = this.radius * (0.2 + 0.85 * crackT);
      const ang = this.tiltAngle + this.angle * 0.15;
      const x1 = Math.cos(ang) * lineLen;
      const y1 = Math.sin(ang) * lineLen;
      ctx.strokeStyle = `rgba(255,255,255,${0.15 + crackT * 0.85})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(x1, y1);
      ctx.stroke();
    }
  }
}

