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
    // Escalonamento progressivo (estilo "combo"): cada colisão alimenta a fúria
    // e a próxima colisão gera ainda mais carga.
    this.rageMax = this.ability.rageMax ?? 40;
    this.rageDecayPerSec = this.ability.rageDecayPerSec ?? 0;
    this.rageGainPerHit = this.ability.rageGainBase ?? 1.0;
    this.rageSpeedBonusMax = this.ability.rageSpeedBonusMax ?? 0.7;
    this.rageTransferBonusMax = this.ability.rageTransferBonusMax ?? 1.0;
    this.rageHitDamageBonusMax = this.ability.rageHitDamageBonusMax ?? 1.6;
    this.hitHealRatioBase = this.ability.hitHealRatioBase ?? 0.14;
    this.lowHpHitHealBonusMax = this.ability.lowHpHitHealBonusMax ?? 0.42;
    this.furyStacks = 0;
    this.crackTimer = 0;
    this.crackLen = 0;
    this.sparkTimer = 0;
    this.flameTimer = 0;
    this.rage = 0;
    this.ragePulse = 0;
  }

  onTick(dt) {
    const hpRatio = this.spinMax > 0 ? this.spin / this.spinMax : 0;
    const furyStacks = Math.floor((1 - hpRatio) / 0.1); // 0..10
    this.furyStacks = clamp(furyStacks, 0, this.maxStacks);

    // Rage sem decay: só cresce com o combate.
    const rageRatio = this.rageMax > 0 ? clamp(this.rage / this.rageMax, 0, 1) : 0;
    this.ragePulse += dt * (2 + rageRatio * 7);

    const speedMult =
      (1 + this.furyStacks * this.speedStep) *
      (1 + rageRatio * this.rageSpeedBonusMax);
    const targetSpeed = this.baseSpeed * speedMult;

    const currentSpeed = Math.sqrt(this.vx * this.vx + this.vy * this.vy);
    if (currentSpeed > 0.1 && currentSpeed < targetSpeed) {
      const scale = targetSpeed / currentSpeed;
      this.vx *= scale;
      this.vy *= scale;
    }

    // Partículas de brasa base
    if (this.game.flags.passiveParticlesEnabled && (this.furyStacks > 3 || rageRatio > 0.1)) {
      this.sparkTimer += dt;
      const aggressiveRate = this.emberRate * (1 + rageRatio * 5);
      const interval = 1 / aggressiveRate;
      while (this.sparkTimer >= interval) {
        this.sparkTimer -= interval;
        const emberCol = this.game.mixColor('#ffe36a', '#ff2a1a', rageRatio);
        this.game.spawnSparks(this.x, this.y, emberCol, 1 + Math.floor(rageRatio * 3), 0.85 + rageRatio * 0.75);
      }
    }

    // Rage alta: chamas saindo de pontos aleatórios do corpo, sempre para cima (eixo Y).
    if (this.game.flags.passiveParticlesEnabled && rageRatio > 0.35) {
      this.flameTimer += dt;
      const flameRate = 6 + rageRatio * 24;
      const flameInterval = 1 / flameRate;
      while (this.flameTimer >= flameInterval) {
        this.flameTimer -= flameInterval;
        const ang = Math.random() * Math.PI * 2;
        const rr = this.radius * (0.2 + Math.random() * 0.75);
        const fx = this.x + Math.cos(ang) * rr;
        const fy = this.y + Math.sin(ang) * rr;
        this.game.particles.emit({
          type: 'spark',
          x: fx,
          y: fy,
          vx: 0,
          vy: -(55 + Math.random() * 120),
          radius: 1.8 + rageRatio * 2.4,
          color: this.game.mixColor('#ffd04a', '#ff1a1a', rageRatio),
          alpha: 0.9,
          decay: 1 / (0.18 + Math.random() * 0.18)
        });
      }
    }

    if (this.crackTimer > 0) this.crackTimer -= dt;
  }

  renderSpinBackground(ctx) {
    super.renderSpinBackground(ctx);
    const hr = hpRatio(this);
    const t = this.game.time;
    const rageRatio = this.rageMax > 0 ? clamp(this.rage / this.rageMax, 0, 1) : 0;
    const ember = this.game.mixColor('#ffd24a', '#ff2a1a', rageRatio);
    const hot = this.game.mixColor('#fff2b0', '#ff6a3a', rageRatio);
    drawDashedEnergyRing(ctx, this.radius, ember, hr, t, {
      inner: 0.7,
      direction: 1,
      alpha: 0.32 + hr * 0.38 + rageRatio * 0.25,
      dash: 5 + hr * 10 + rageRatio * 6
    });
    drawCounterRing(ctx, this.radius, 'rgba(255,200,140,0.55)', hr, t);
    drawRadialMotionStrokes(ctx, this.radius, 9 + Math.floor(rageRatio * 7), hr, hot);
    drawVertexSparkles(ctx, this.radius, 3, hr, 'rgba(255,255,220,0.95)', t, { direction: 1, size: 2.2 });
  }

  onCollide(other, impactForce) {
    // Aumenta spinTransfer causado: quando este é o "mais forte" na colisão.
    if (this.spin <= other.spin) {
      // Visual de rachaduras por ataque recebido também faz sentido, mas a spec
      // fala em dano causado; mantemos o efeito mais forte ao retaliar.
    }

    const rageRatio = this.rageMax > 0 ? clamp(this.rage / this.rageMax, 0, 1) : 0;
    const hpR = this.spinMax > 0 ? clamp(this.spin / this.spinMax, 0, 1) : 0;
    const lowHpFactor = 1 - hpR;

    // Extra spin transfer para quem está causando (forte -> fraco).
    if (this.spin > other.spin) {
      // Dano escala somente com força acumulada por hits (rage).
      const damageMult = 1 + rageRatio * (this.rageTransferBonusMax + this.rageHitDamageBonusMax);
      const extraTransfer = impactForce * SPIN_TRANSFER_RATIO * damageMult;
      other.spin -= extraTransfer;
      // Cura escala somente com HP atual (quanto menor HP, maior sustain).
      const healRatio = this.hitHealRatioBase + lowHpFactor * this.lowHpHitHealBonusMax;
      const healAmount = impactForce * SPIN_TRANSFER_RATIO * healRatio;
      this.spin = Math.min(this.spinMax, this.spin + healAmount);
    }

    // Escalonamento em cadeia: cada impacto aumenta a carga atual e
    // também aumenta quanto o próximo impacto carregará.
    if (other && other.alive && !other.immovable) {
      this.rage = Math.min(this.rageMax, this.rage + this.rageGainPerHit);
    }

    // Rachaduras (render-based)
    this.crackTimer = this.crackDuration;
    this.crackLen = clamp(impactForce / 25, 0.3, 1.2);
    if (this.game.flags.passiveParticlesEnabled) {
      this.game.spawnCrackSparks(this.x, this.y, other, this.color, 10);
    }
  }

  renderWorldExtras(ctx, opts) {}

  renderBody(ctx) {
    // Triângulo dentado (pião: corpo + borda agressiva + miolo).
    const r = this.radius;
    const furyMax = this.spinMax > 0 ? this.spin / this.spinMax < this.furyMaxHpThreshold : false;
    const rageRatio = this.rageMax > 0 ? clamp(this.rage / this.rageMax, 0, 1) : 0;
    const renderScale = (furyMax ? 1.1 : 1) * (1 + rageRatio * 0.22);

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
    const lowHpFactor = 1 - hpRatio;
    const sat = furyMax ? 1 : clamp(1 - hpRatio, 0, 1);
    const glow = (furyMax ? 0.7 : 0.35) + rageRatio * 0.22;
    // Cor base parte amarela e evolui para vermelho pela força atual (rage).
    const warmStart = '#ffe36a';
    const redStage = this.game.mixColor(warmStart, '#ff1212', Math.pow(rageRatio, 1.2));
    // Pulso de vermelho vivo cresce progressivamente com HP baixo.
    const pulseAmp = Math.pow(lowHpFactor, 1.35) * (0.12 + rageRatio * 0.88);
    const pulse = pulseAmp * (0.5 + 0.5 * Math.sin(this.ragePulse * 3.2));
    const pulsingRed = this.game.mixColor(redStage, '#ff0000', pulse * 0.7);
    const fillCol = this.game.mixColor(pulsingRed, '#ffffff', glow * sat * 0.08);

    ctx.fillStyle = createBodyRadialGradient(ctx, fillCol, r);
    ctx.fill();

    const strokeColor = this.game.mixColor('#a06a10', '#ff2600', clamp(rageRatio + pulse * 0.6, 0, 1));
    ctx.strokeStyle = strokeColor;
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
      hub: this.game.mixColor('#fff2a8', '#ff3a28', clamp(rageRatio * 0.85 + pulse * 0.4, 0, 1)),
      hubStroke: this.game.mixColor('#9a620c', '#9a1408', clamp(rageRatio + pulse * 0.5, 0, 1)),
      hubScale: 0.3
    });

    ctx.restore();
  }
}

