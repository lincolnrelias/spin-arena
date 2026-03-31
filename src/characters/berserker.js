import { Top } from '../top.js';
import { SPIN_TRANSFER_RATIO } from '../physics.js';
import { clamp } from '../utils.js';
import { hpRatio, drawDashedEnergyRing, drawCounterRing, drawRadialMotionStrokes, drawVertexSparkles, createBodyRadialGradient, drawSpinTopHub } from '../spinVisual.js';

export class Berserker extends Top {
  constructor(game, cfg) {
    super(game, cfg);
    this.ability = cfg.ability ?? {};
    this.baseSpeed = this.speed ?? 220;
    this.speedStep = this.ability.speedStep ?? 0.15;
    this.maxStacks = this.ability.maxStacks ?? 10;
    this.spinTransferPerStack = this.ability.spinTransferPerStack ?? 0.08;
    this.furyMaxHpThreshold = this.ability.furyMaxHpThreshold ?? 0.2;
    this.crackDuration = this.ability.crackDuration ?? 0.22;
    this.emberRate = this.ability.emberRate ?? 4;
    this.furyStacks = 0;
    this.crackTimer = 0;
    this.crackLen = 0;
    this.sparkTimer = 0;
  }

  onTick(dt) {
    const hpRatio = this.spinMax > 0 ? this.spin / this.spinMax : 0;
    const furyStacks = Math.floor((1 - hpRatio) / 0.1); // 0..10
    this.furyStacks = clamp(furyStacks, 0, this.maxStacks);

    const speedMult = 1 + this.furyStacks * this.speedStep;
    const targetSpeed = this.baseSpeed * speedMult;

    const currentSpeed = Math.sqrt(this.vx * this.vx + this.vy * this.vy);
    if (currentSpeed > 0.1 && currentSpeed < targetSpeed) {
      const scale = targetSpeed / currentSpeed;
      this.vx *= scale;
      this.vy *= scale;
    }

    // Partículas de brasa (somente em budgets baixos)
    if (this.game.flags.passiveParticlesEnabled && this.furyStacks > 5) {
      this.sparkTimer += dt;
      const interval = 1 / this.emberRate;
      while (this.sparkTimer >= interval) {
        this.sparkTimer -= interval;
        this.game.spawnSparks(this.x, this.y, this.color, 1, 0.8);
      }
    }

    if (this.crackTimer > 0) this.crackTimer -= dt;
  }

  renderSpinBackground(ctx) {
    super.renderSpinBackground(ctx);
    const hr = hpRatio(this);
    const t = this.game.time;
    const ember = '#ff5a28';
    const hot = '#ffc4a0';
    drawDashedEnergyRing(ctx, this.radius, ember, hr, t, { inner: 0.7, direction: 1, alpha: 0.32 + hr * 0.38, dash: 5 + hr * 10 });
    drawCounterRing(ctx, this.radius, 'rgba(255,200,140,0.55)', hr, t);
    drawRadialMotionStrokes(ctx, this.radius, 9, hr, hot);
    drawVertexSparkles(ctx, this.radius, 3, hr, 'rgba(255,255,220,0.95)', t, { direction: 1, size: 2.2 });
  }

  onCollide(other, impactForce) {
    // Aumenta spinTransfer causado: quando este é o "mais forte" na colisão.
    if (this.spin <= other.spin) {
      // Visual de rachaduras por ataque recebido também faz sentido, mas a spec
      // fala em dano causado; mantemos o efeito mais forte ao retaliar.
    }

    const furyStacks = this.furyStacks ?? 0;

    // Extra spin transfer para quem está causando (forte -> fraco).
    if (this.spin > other.spin && furyStacks > 0) {
      const extraTransfer = impactForce * SPIN_TRANSFER_RATIO * furyStacks * this.spinTransferPerStack;
      other.spin -= extraTransfer;
      this.spin += extraTransfer * 0.3;
    }

    // Rachaduras (render-based)
    this.crackTimer = this.crackDuration;
    this.crackLen = clamp(impactForce / 25, 0.3, 1.2);
    if (this.game.flags.passiveParticlesEnabled) {
      this.game.spawnCrackSparks(this.x, this.y, other, this.color, 10);
    }
  }

  renderBody(ctx) {
    // Triângulo dentado (pião: corpo + borda agressiva + miolo).
    const r = this.radius;
    const furyMax = this.spinMax > 0 ? this.spin / this.spinMax < this.furyMaxHpThreshold : false;
    const renderScale = furyMax ? 1.08 : 1;

    ctx.save();
    ctx.scale(renderScale, renderScale);

    const crackT = this.crackTimer > 0 ? this.crackTimer / this.crackDuration : 0;
    const crackCount = 2 + Math.floor(clamp(this.furyStacks, 0, this.maxStacks) / 2);

    // Base shape
    ctx.beginPath();
    const tipX = 0;
    const tipY = -r;
    ctx.moveTo(tipX, tipY);
    for (let i = 0; i < 3; i++) {
      const a0 = (Math.PI * 2 * i) / 3 + Math.PI / 6;
      const a1 = a0 + Math.PI / 3;
      const px0 = Math.cos(a0) * r * 0.9;
      const py0 = Math.sin(a0) * r * 0.9;
      const px1 = Math.cos(a1) * r * 0.9;
      const py1 = Math.sin(a1) * r * 0.9;
      ctx.lineTo(px0, py0);
      // Dent
      ctx.lineTo((px0 + px1) * 0.5, (py0 + py1) * 0.5);
      ctx.lineTo(px1, py1);
    }
    ctx.closePath();

    const hpRatio = this.spinMax > 0 ? this.spin / this.spinMax : 0;
    const sat = furyMax ? 1 : clamp(1 - hpRatio, 0, 1);
    const glow = furyMax ? 0.7 : 0.35;
    const fillCol = this.game.mixColor(this.color, '#ffffff', glow * sat * 0.12);

    ctx.fillStyle = createBodyRadialGradient(ctx, fillCol, r);
    ctx.fill();

    ctx.strokeStyle = `rgba(120,25,12,${0.75 + sat * 0.25})`;
    ctx.lineWidth = 4;
    ctx.lineJoin = 'round';
    ctx.stroke();

    // Rachaduras (linhas brancas)
    if (crackT > 0) {
      ctx.strokeStyle = `rgba(255,255,255,${0.15 + crackT * 0.8})`;
      ctx.lineWidth = 2;
      const baseLen = r * 0.9 * this.crackLen;
      for (let i = 0; i < crackCount; i++) {
        const ang = (i - crackCount / 2) * 0.35;
        const len = baseLen * (0.35 + 0.65 * (i / crackCount));
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(Math.cos(ang) * len, Math.sin(ang) * len);
        ctx.stroke();
      }
    }

    drawSpinTopHub(ctx, r, {
      body: fillCol,
      hub: this.game.mixColor('#fff5f0', this.color, 0.35),
      hubStroke: 'rgba(90,20,10,0.85)',
      hubScale: 0.3
    });

    ctx.restore();
  }
}

