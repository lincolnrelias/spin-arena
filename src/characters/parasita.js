import { Top } from '../top.js';
import { clamp, lerp } from '../utils.js';
import {
  hpRatio,
  drawDashedEnergyRing,
  drawRadialMotionStrokes,
  drawVertexSparkles,
  createBodyRadialGradient,
  drawSpinTopHub
} from '../spinVisual.js';

/**
 * Leque uniforme no eixo parasita→alvo: separação angular mínima entre adjacentes,
 * até um leque máximo (comprime o passo se n for grande).
 */
function tentacleAngularOffsetRad(vi, n, minSep, maxFan) {
  if (n <= 1) return 0;
  const fanWidth = Math.min((n - 1) * minSep, maxFan);
  const step = fanWidth / (n - 1);
  return -fanWidth / 2 + vi * step;
}

/**
 * Desenha um filamento orgânico + pacote de energia (coordenadas de mundo absolutas).
 * sagSign alterna o lado da curvatura para afastar curvas no plano.
 */
function drawFilament(ctx, sx, sy, ex, ey, leech, time, spread, sagSign = 1) {
  const dx = ex - sx;
  const dy = ey - sy;
  const L = Math.hypot(dx, dy) || 1;
  const nx = -dy / L;
  const ny = dx / L;
  const ox = nx * spread;
  const oy = ny * spread;
  const ax = sx + ox;
  const ay = sy + oy;
  const bx = ex + ox;
  const by = ey + oy;
  const sag = L * 0.065 * sagSign;
  const mx = (ax + bx) / 2 + nx * sag;
  const my = (ay + by) / 2 + ny * sag;

  const total = Math.max(1, leech.totalPulses);
  const intra = (leech.acc ?? 0) / Math.max(1e-6, leech.pulseInterval);
  const travelT = clamp((leech.pulsesDone + intra) / total, 0, 1);
  const pulseGlow = leech.pulseGlow ?? 0;

  const wave = 0.5 + 0.5 * Math.sin(time * (8 + total * 0.08) + leech.seed * 0.01);

  // Sombra / glow externo
  ctx.save();
  ctx.strokeStyle = `rgba(20, 60, 40, ${0.35 + pulseGlow * 0.35})`;
  ctx.lineWidth = 7 + pulseGlow * 4;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(ax, ay);
  ctx.quadraticCurveTo(mx, my, bx, by);
  ctx.stroke();

  // Núcleo luminoso
  const g = ctx.createLinearGradient(ax, ay, bx, by);
  const mid = clamp(travelT, 0.15, 0.85);
  g.addColorStop(0, `rgba(120, 255, 190, ${0.25 + wave * 0.2 + pulseGlow * 0.35})`);
  g.addColorStop(mid, `rgba(200, 255, 230, ${0.75 + pulseGlow * 0.25})`);
  g.addColorStop(1, `rgba(80, 200, 140, ${0.2 + pulseGlow * 0.2})`);
  ctx.strokeStyle = g;
  ctx.lineWidth = 2.8 + pulseGlow * 2;
  ctx.setLineDash([10, 8]);
  ctx.lineDashOffset = -time * (10 + Math.min(total, 24) * 0.35);
  ctx.beginPath();
  ctx.moveTo(ax, ay);
  ctx.quadraticCurveTo(mx, my, bx, by);
  ctx.stroke();
  ctx.setLineDash([]);

  // Pacote de energia viajando (dano visual)
  const tq = travelT;
  const cx = (1 - tq) * (1 - tq) * ax + 2 * (1 - tq) * tq * mx + tq * tq * bx;
  const cy = (1 - tq) * (1 - tq) * ay + 2 * (1 - tq) * tq * my + tq * tq * by;
  const rBlob = 4 + pulseGlow * 5 + wave * 2;
  ctx.fillStyle = `rgba(220, 255, 240, ${0.55 + pulseGlow * 0.4})`;
  ctx.beginPath();
  ctx.arc(cx, cy, rBlob, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = `rgba(255, 255, 255, ${0.35 + pulseGlow * 0.45})`;
  ctx.lineWidth = 1.2;
  ctx.stroke();

  // Anel no alvo (gruda na borda)
  ctx.strokeStyle = `rgba(100, 255, 180, ${0.35 + pulseGlow * 0.45})`;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(bx, by, 5 + pulseGlow * 3, 0, Math.PI * 2);
  ctx.stroke();

  ctx.restore();
}

export class Parasita extends Top {
  constructor(game, cfg) {
    super(game, cfg);
    this.ability = cfg.ability ?? {};
    this.drainTotalRatio =
      this.ability.drainTotalRatio ??
      (this.ability.drainRateRatio != null && this.ability.leechDuration != null
        ? this.ability.drainRateRatio * this.ability.leechDuration
        : 0.04);
    this.basePulses = this.ability.basePulses ?? 4;
    this.maxFilamentsPerTarget =
      this.ability.maxFilamentsPerTarget ?? this.ability.maxLeechesPerTarget ?? 3;
    this.healRatio = this.ability.healRatio ?? 0.5;
    /** Segundos entre pulsos por filamento (fixo; cada tentáculo tem o próprio relógio). */
    this.pulseIntervalSec = this.ability.pulseInterval ?? 0.5;
    /** Separação angular mínima (rad) entre tentáculos adjacentes no leque */
    this.tentacleMinSepAngle = this.ability.tentacleMinSepAngle ?? 0.4;
    /** Largura máxima do leque (rad) no alvo — mantém ancoragens na borda do inimigo */
    this.tentacleMaxFan = this.ability.tentacleMaxFan ?? Math.PI * 0.92;
    /**
     * Leque no parasita: mais largo que tentacleMaxFan para os pontos de saída cobrirem
     * a circunferência (não ficarem numa “reta” voltada ao alvo).
     */
    this.tentacleMaxFanParasite =
      this.ability.tentacleMaxFanParasite ?? Math.PI * 1.85;
    /** Deslocamento perpendicular (px) base entre fios vizinhos */
    this.tentaclePerpStride = this.ability.tentaclePerpStride ?? 11;
    /** Aumento do stride por quantidade de tentáculos (evita encosto no plano quando n é grande) */
    this.tentaclePerpStridePerCount = this.ability.tentaclePerpStridePerCount ?? 2.2;
    this.nextHitPulses = this.basePulses;
    this.infectedTargets = [];
  }

  onDeath() {
    this.nextHitPulses = this.basePulses;
  }

  onCollide(other) {
    if (!other || !other.alive || other.immovable) return;

    if (!other.leeches) other.leeches = [];
    const fromMe = other.leeches.filter(l => l && l.source === this).length;
    if (fromMe >= this.maxFilamentsPerTarget) return;

    const pulsesForThis = Math.max(1, Math.min(this.nextHitPulses, 160));
    this.nextHitPulses = pulsesForThis + 1;

    const totalDrain = other.spinMax * this.drainTotalRatio;
    const drainPerPulse = totalDrain / pulsesForThis;
    const pulseInterval = this.pulseIntervalSec;

    other.leeches.push({
      filamentType: 'parasita',
      source: this,
      healRatio: this.healRatio,
      totalPulses: pulsesForThis,
      totalDrainBudget: totalDrain,
      pulsesDone: 0,
      acc: 0,
      pulseInterval,
      drainPerPulse,
      slotIndex: fromMe,
      seed: (this.id || 0) * 13.7 + other.id * 17.3 + Math.random() * 50,
      pulseGlow: 0
    });

    if (!this.infectedTargets.includes(other)) this.infectedTargets.push(other);
  }

  onTick(dt) {
    if (this.infectedTargets.length) {
      this.infectedTargets = this.infectedTargets.filter(t => {
        if (!t || t.remove || !t.alive) return false;
        if (!t.leeches || !t.leeches.length) return false;
        return t.leeches.some(l => l && l.filamentType === 'parasita' && l.source === this);
      });
    }
  }

  renderSpinBackground(ctx) {
    super.renderSpinBackground(ctx);
    const hr = hpRatio(this);
    const t = this.game.time;
    const bio = 'rgba(90,255,170,0.9)';
    drawDashedEnergyRing(ctx, this.radius, bio, hr, t, { inner: 0.63, direction: 1, alpha: 0.22 + hr * 0.4, gap: 8 });
    drawRadialMotionStrokes(ctx, this.radius, 16, hr, 'rgba(200,255,220,0.85)');
    drawVertexSparkles(ctx, this.radius, 7, hr, 'rgba(220,255,230,0.9)', t, { direction: -1, radiusScale: 0.72 });
  }

  renderWorldExtras(ctx, opts) {
    const alpha = opts.alpha ?? 1;
    const px = opts.x ?? this.x;
    const py = opts.y ?? this.y;
    const time = this.game.time;

    for (const target of this.infectedTargets) {
      if (!target || !target.leeches) continue;
      const mine = target.leeches
        .filter(l => l && l.filamentType === 'parasita' && l.source === this)
        .sort((a, b) => (a.slotIndex ?? 0) - (b.slotIndex ?? 0));
      const n = mine.length;
      const minSep = this.tentacleMinSepAngle;
      const maxFanTarget = this.tentacleMaxFan;
      const maxFanParasite = this.tentacleMaxFanParasite;
      const stride =
        this.tentaclePerpStride + Math.min(n, 28) * this.tentaclePerpStridePerCount;

      for (let vi = 0; vi < mine.length; vi++) {
        const leech = mine[vi];
        const tx =
          target.prevX !== undefined ? lerp(target.prevX, target.x, alpha) : target.x;
        const ty =
          target.prevY !== undefined ? lerp(target.prevY, target.y, alpha) : target.y;
        const dx = tx - px;
        const dy = ty - py;
        const baseToT = Math.atan2(dy, dx);
        const baseToP = Math.atan2(py - ty, px - tx);
        const offP = tentacleAngularOffsetRad(vi, n, minSep, maxFanParasite);
        const offT = tentacleAngularOffsetRad(vi, n, minSep, maxFanTarget);
        const startA = baseToT + offP;
        const endA = baseToP + offT;
        const sx = px + Math.cos(startA) * this.radius;
        const sy = py + Math.sin(startA) * this.radius;
        const ex = tx + Math.cos(endA) * target.radius;
        const ey = ty + Math.sin(endA) * target.radius;
        const spread = (vi - (n - 1) / 2) * stride;
        const sagSign = vi % 2 === 0 ? 1 : -1;
        drawFilament(ctx, sx, sy, ex, ey, leech, time, spread, sagSign);
      }
    }
  }

  renderBody(ctx) {
    const r = this.radius;
    const pts = 14;
    ctx.beginPath();
    for (let i = 0; i < pts; i++) {
      const a = (Math.PI * 2 * i) / pts;
      const wob = 0.78 + 0.22 * Math.sin(a * 3 + this.id * 7.13 + r * 0.01);
      const rr = r * wob;
      const px = Math.cos(a) * rr;
      const py = Math.sin(a) * rr;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();

    ctx.fillStyle = createBodyRadialGradient(ctx, this.color, r);
    ctx.globalAlpha = 0.96;
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = 'rgba(25,70,50,0.9)';
    ctx.lineWidth = 3;
    ctx.lineJoin = 'round';
    ctx.stroke();

    drawSpinTopHub(ctx, r, {
      body: this.color,
      hub: 'rgba(210,255,235,0.92)',
      hubStroke: 'rgba(25,90,55,0.85)',
      hubScale: 0.28
    });
  }
}
