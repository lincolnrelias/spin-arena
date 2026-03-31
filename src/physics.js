import { clamp } from './utils.js';

// Spin transfer / boundary drain (calibração baseada no spec).
export const SPIN_TRANSFER_RATIO = 0.015; // ex: 0.015
export const BORDER_SPIN_DRAIN = 0.008; // ex: 0.008

// Shockwave tuning (sem números no spec além do shape; calibrado relativo).
export const WAVE_MAX_RADIUS = 150;
export const WAVE_POWER_SCALE = 0.003; // power = impactForce * scale

export class SpatialHash {
  constructor(cellSize = 80) {
    this.cellSize = cellSize;
    this.cells = new Map();
  }

  key(x, y) {
    return `${Math.floor(x / this.cellSize)},${Math.floor(y / this.cellSize)}`;
  }

  clear() {
    this.cells.clear();
  }

  insert(top) {
    const k = this.key(top.x, top.y);
    if (!this.cells.has(k)) this.cells.set(k, []);
    this.cells.get(k).push(top);
  }

  query(top) {
    const cx = Math.floor(top.x / this.cellSize);
    const cy = Math.floor(top.y / this.cellSize);
    const result = [];
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const k = `${cx + dx},${cy + dy}`;
        if (this.cells.has(k)) result.push(...this.cells.get(k));
      }
    }
    return result;
  }
}

export function handleArenaBoundary(top, arenaRect) {
  const minX = arenaRect.x + top.radius;
  const maxX = arenaRect.x + arenaRect.w - top.radius;
  const minY = arenaRect.y + top.radius;
  const maxY = arenaRect.y + arenaRect.h - top.radius;

  let impact = 0;

  // Collider imutável: apenas clamp.
  if (top.immovable) {
    top.x = Math.min(maxX, Math.max(minX, top.x));
    top.y = Math.min(maxY, Math.max(minY, top.y));
    return 0;
  }

  // Parede esquerda
  if (top.x < minX) {
    top.x = minX;
    const i = Math.abs(top.vx);
    impact = Math.max(impact, i);
    top.vx = Math.abs(top.vx) * top.restitution;
  }
  // Parede direita
  if (top.x > maxX) {
    top.x = maxX;
    const i = Math.abs(top.vx);
    impact = Math.max(impact, i);
    top.vx = -Math.abs(top.vx) * top.restitution;
  }
  // Parede superior
  if (top.y < minY) {
    top.y = minY;
    const i = Math.abs(top.vy);
    impact = Math.max(impact, i);
    top.vy = Math.abs(top.vy) * top.restitution;
  }
  // Parede inferior
  if (top.y > maxY) {
    top.y = maxY;
    const i = Math.abs(top.vy);
    impact = Math.max(impact, i);
    top.vy = -Math.abs(top.vy) * top.restitution;
  }

  if (impact > 0) {
    top.spin -= impact * BORDER_SPIN_DRAIN;
  }
  return impact;
}

export function resolveCollision(a, b) {
  if (!a.alive || !b.alive) return;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const dist = Math.sqrt(dx * dx + dy * dy);
  if (dist === 0) return;

  const minDist = a.radius + b.radius;
  if (dist >= minDist) return;

  const nx = dx / dist;
  const ny = dy / dist;

  // Separação (evitar sobreposição)
  const overlap = (minDist - dist) / 2;

  const invMassA = a.immovable ? 0 : 1 / a.mass;
  const invMassB = b.immovable ? 0 : 1 / b.mass;
  const invSum = invMassA + invMassB;

  if (invSum > 0) {
    const aShare = invMassA / invSum;
    const bShare = invMassB / invSum;
    a.x -= nx * overlap * 2 * aShare;
    a.y -= ny * overlap * 2 * aShare;
    b.x += nx * overlap * 2 * bShare;
    b.y += ny * overlap * 2 * bShare;
  }

  // Velocidade relativa na direção da normal
  const rvx = b.vx - a.vx;
  const rvy = b.vy - a.vy;
  const rvDotN = rvx * nx + rvy * ny;
  if (rvDotN > 0) return; // já se separando

  const e = Math.min(a.restitution, b.restitution);
  const j = -(1 + e) * rvDotN / (invMassA + invMassB || 1);

  if (!a.immovable) {
    a.vx -= (j * invMassA) * nx;
    a.vy -= (j * invMassA) * ny;
  }
  if (!b.immovable) {
    b.vx += (j * invMassB) * nx;
    b.vy += (j * invMassB) * ny;
  }

  const impactForce = Math.abs(j);

  // Spin transfer (de quem tem menos spin para quem tem mais)
  const aPreSpin = a.spin;
  const bPreSpin = b.spin;

  const aWeaker = aPreSpin < bPreSpin;
  const weaker = aWeaker ? a : b;
  const stronger = aWeaker ? b : a;

  // Bonus contra nemesis (Fenda)
  let nemesisMul = 1;
  if (stronger.nemesis && stronger.nemesis === weaker) nemesisMul = 1.2;

  const baseTransfer = impactForce * SPIN_TRANSFER_RATIO;
  const spinTransfer = baseTransfer * nemesisMul;

  // Só transfere spin se o mais fraco puder perder; evita “criar” spin no mais forte
  // (ex.: fantasma imóvel / props) — antes o mais forte ganhava 0.3× sem o outro perder.
  if (!weaker.immovable) {
    weaker.spin -= spinTransfer;
    if (!stronger.immovable) stronger.spin += spinTransfer * 0.3;

    // Floating damage numbers (opcional, visual-only).
    if (weaker.game && typeof weaker.game.spawnDamageText === 'function' && spinTransfer > 0) {
      weaker.game.spawnDamageText(weaker.x, weaker.y, spinTransfer, stronger.color ?? stronger.game.themeColorFor?.(stronger), weaker);
    }

    // Salva "quem causou dano": o mais fraco (dano recebido) marca o inimigo.
    weaker.lastDamageSource = stronger;
  }

  // Eventos / habilidades
  if (a && typeof a.onCollide === 'function') a.onCollide(b, impactForce, nx, ny);
  if (b && typeof b.onCollide === 'function') b.onCollide(a, impactForce, nx, ny);

  a.stats.collisions++;
  b.stats.collisions++;
}

export function updateShockwaves(game, dt, tops) {
  const shockwaves = game.shockwaves;
  if (!shockwaves.length) return;

  for (let i = shockwaves.length - 1; i >= 0; i--) {
    const w = shockwaves[i];
    w.age += dt;
    const t = clamp(w.age / w.duration, 0, 1);
    w.radius = w.maxRadius * t;

    // Hit em tops
    for (let j = 0; j < tops.length; j++) {
      const top = tops[j];
      if (!top.alive) continue;
      if (w.hits.has(top.id)) continue;

      const dx = top.x - w.x;
      const dy = top.y - w.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > w.radius) continue;

      w.hits.add(top.id);

      const hitT = 1 - dist / w.maxRadius;
      const spinDamage = w.power * hitT;
      const dmg = Math.max(0, spinDamage);

      // Aplica spinDamage e impulso radial
      top.spin -= dmg;
      if (!top.immovable && dist > 0.001) {
        const nx = dx / dist;
        const ny = dy / dist;
        top.vx += nx * dmg * 0.02;
        top.vy += ny * dmg * 0.02;
      }
      // Micro flash: pequena ring via partículas
      game.spawnShockwaveHitFlash(top.x, top.y, w.color ?? game.themeColorFor(top));
    }

    if (w.age >= w.duration) {
      shockwaves.splice(i, 1);
    }
  }
}

export function drawShockwaves(ctx, shockwaves) {
  for (const w of shockwaves) {
    const t = clamp(w.age / w.duration, 0, 1);
    const alpha = 1 - t;
    ctx.save();
    ctx.globalAlpha = 0.9 * alpha;
    ctx.strokeStyle = w.color ?? 'rgba(180,120,255,0.8)';
    ctx.lineWidth = Math.max(1.2, 4 * (1 - t));
    ctx.beginPath();
    ctx.arc(w.x, w.y, w.radius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
}

