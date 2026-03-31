import { clamp } from './utils.js';

/** Proporção de vida atual (0..1) usada só para arte / rotação visual */
export function hpRatio(top) {
  if (!top || !top.spinMax) return 0;
  return clamp(top.spin / top.spinMax, 0, 1);
}

function hexToRgb(hex) {
  const s = hex.replace('#', '').trim();
  const full = s.length === 3 ? s.split('').map(ch => ch + ch).join('') : s;
  const n = parseInt(full, 16);
  if (Number.isNaN(n)) return { r: 128, g: 128, b: 128 };
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function rgbStr(r, g, b, a = 1) {
  return a < 1 ? `rgba(${r},${g},${b},${a})` : `rgb(${r},${g},${b})`;
}

/** Preenchimento “volume” para qualquer silhueta fechada centrada em (0,0) */
export function createBodyRadialGradient(ctx, color, radius) {
  const { r, g, b } = hexToRgb(color);
  const gFill = ctx.createRadialGradient(0, 0, 0, 0, 0, radius * 0.92);
  gFill.addColorStop(0, rgbStr(Math.min(255, r + 55), Math.min(255, g + 50), Math.min(255, b + 45)));
  gFill.addColorStop(0.55, color);
  gFill.addColorStop(1, rgbStr(Math.max(0, r - 35), Math.max(0, g - 35), Math.max(0, b - 28)));
  return gFill;
}

/**
 * Pião visto de cima: disco com volume, borda destacada e miolo (pinho).
 * `palette.rim` / `palette.hub` diferenciam os agentes.
 */
export function drawSpinTopFromAbove(ctx, radius, palette = {}) {
  const body = palette.body ?? '#888888';
  const { r, g, b } = hexToRgb(body);
  const rim = palette.rim ?? rgbStr(Math.floor(r * 0.35), Math.floor(g * 0.32), Math.floor(b * 0.45), 0.95);
  const rimW = palette.rimWidth ?? 4;
  const hubScale = palette.hubScale ?? 0.3;
  const hubR = radius * hubScale;
  const hub = palette.hub ?? rgbStr(Math.min(255, r + 55), Math.min(255, g + 55), Math.min(255, b + 60), 0.92);
  const hubStroke = palette.hubStroke ?? rgbStr(Math.floor(r * 0.5), Math.floor(g * 0.48), Math.floor(b * 0.55), 0.85);

  ctx.beginPath();
  ctx.arc(0, 0, radius, 0, Math.PI * 2);
  ctx.fillStyle = createBodyRadialGradient(ctx, body, radius);
  ctx.fill();
  ctx.strokeStyle = rim;
  ctx.lineWidth = rimW;
  ctx.lineJoin = 'round';
  ctx.stroke();

  if (palette.innerGroove) {
    ctx.beginPath();
    ctx.arc(0, 0, radius * 0.74, 0, Math.PI * 2);
    ctx.strokeStyle = palette.innerGroove;
    ctx.lineWidth = 1.2;
    ctx.globalAlpha = 0.4;
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  ctx.beginPath();
  ctx.arc(0, 0, hubR, 0, Math.PI * 2);
  ctx.fillStyle = hub;
  ctx.fill();
  ctx.strokeStyle = hubStroke;
  ctx.lineWidth = palette.hubStrokeWidth ?? 1.6;
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(-hubR * 0.22, -hubR * 0.28, hubR * 0.42, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255,255,255,0.28)';
  ctx.fill();
}

/** Só o miolo (para formatos hex/tri/oval) */
export function drawSpinTopHub(ctx, radius, palette = {}) {
  const hubScale = palette.hubScale ?? 0.3;
  const hubR = radius * hubScale;
  const body = palette.body ?? '#888';
  const { r, g, b } = hexToRgb(body);
  const hub = palette.hub ?? rgbStr(Math.min(255, r + 55), Math.min(255, g + 55), Math.min(255, b + 60), 0.92);
  const hubStroke = palette.hubStroke ?? rgbStr(Math.floor(r * 0.5), Math.floor(g * 0.48), Math.floor(b * 0.55), 0.85);

  ctx.beginPath();
  ctx.arc(0, 0, hubR, 0, Math.PI * 2);
  ctx.fillStyle = hub;
  ctx.fill();
  ctx.strokeStyle = hubStroke;
  ctx.lineWidth = palette.hubStrokeWidth ?? 1.6;
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(-hubR * 0.22, -hubR * 0.28, hubR * 0.42, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255,255,255,0.28)';
  ctx.fill();
}

/**
 * Velocidade angular visual (rad/s) em HP cheio — a rotação desacelera com o HP.
 * minRatio evita parar completamente antes da morte.
 */
export function visualAngularVelocity(top, opts = {}) {
  const r = hpRatio(top);
  const minRatio = opts.minRatio ?? 0.12;
  const base = opts.base ?? 22;
  const eased = minRatio + (1 - minRatio) * (r * r);
  return base * eased;
}

/** Anel tracejado interno que “corre” — só rotação contínua (sem oscilar o anel) */
export function drawDashedEnergyRing(ctx, radius, color, hpR, time, opts = {}) {
  const a = opts.alpha ?? 0.35 + hpR * 0.45;
  const lw = opts.lineWidth ?? 2;
  const dash = opts.dash ?? 6 + hpR * 8;
  const gap = opts.gap ?? 4;
  const dir = opts.direction ?? 1;
  ctx.save();
  ctx.strokeStyle = color;
  ctx.globalAlpha = a;
  ctx.lineWidth = lw;
  ctx.setLineDash([dash, gap]);
  ctx.lineDashOffset = -time * 80 * hpR * dir;
  ctx.beginPath();
  ctx.arc(0, 0, radius * (opts.inner ?? 0.72), 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.globalAlpha = 1;
  ctx.restore();
}

/** Arco de “carga” restante (0..360° do HP) */
export function drawHpSweepArc(ctx, radius, hpR, baseColor) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(0, 0, radius * 0.42, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * hpR);
  ctx.strokeStyle = baseColor;
  ctx.globalAlpha = 0.55 + hpR * 0.35;
  ctx.lineWidth = 4;
  ctx.lineCap = 'round';
  ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.restore();
}

/** Marcas radiais que lembram disco girando */
export function drawRadialMotionStrokes(ctx, radius, count, hpR, color) {
  const inner = radius * 0.38;
  const outer = radius * 0.88;
  ctx.save();
  ctx.globalAlpha = 0.2 + hpR * 0.55;
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(1, 1.2 + hpR * 1.5);
  for (let i = 0; i < count; i++) {
    const a = (Math.PI * 2 * i) / count;
    const fade = 0.35 + 0.65 * ((i + count * 0.37) % 3) / 3;
    ctx.globalAlpha = (0.15 + hpR * 0.5) * fade;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * inner, Math.sin(a) * inner);
    ctx.lineTo(Math.cos(a) * outer, Math.sin(a) * outer);
    ctx.stroke();
  }
  ctx.restore();
}

/** Segundo anel (mesmo sentido de giro contínuo, sem “vai e vem”) */
export function drawCounterRing(ctx, radius, color, hpR, time) {
  ctx.save();
  ctx.rotate(time * (1.5 + hpR * 2));
  ctx.strokeStyle = color;
  ctx.globalAlpha = 0.18 + hpR * 0.25;
  ctx.lineWidth = 1.5;
  ctx.setLineDash([3, 6]);
  ctx.beginPath();
  ctx.arc(0, 0, radius * 0.58, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.globalAlpha = 1;
  ctx.restore();
}

/** Brilhos nos vértices de um polígono — leitura clara de rotação */
export function drawVertexSparkles(ctx, radius, sides, hpR, color, time, opts = {}) {
  const scale = opts.radiusScale ?? 0.78;
  ctx.save();
  for (let i = 0; i < sides; i++) {
    const a = (Math.PI * 2 * i) / sides + time * (0.35 + hpR * 0.5) * (opts.direction ?? 1);
    const x = Math.cos(a) * radius * scale;
    const y = Math.sin(a) * radius * scale;
    const s = (opts.size ?? 2) + hpR * 2 + (i % 2) * 0.9;
    ctx.fillStyle = color;
    ctx.globalAlpha = (opts.alphaMin ?? 0.32) + hpR * (opts.alphaRange ?? 0.48);
    ctx.beginPath();
    ctx.arc(x, y, s, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.restore();
}

/** Espiral suave — “fenda” / distorção visual */
export function drawSpiralEnergy(ctx, radius, hpR, time, color, opts = {}) {
  const turns = opts.turns ?? 1.6;
  const segments = opts.segments ?? 32;
  const r0 = radius * (opts.r0 ?? 0.22);
  const r1 = radius * (opts.r1 ?? 0.82);
  const spin = time * (1.1 + hpR * 1.8) * (opts.direction ?? 1);
  ctx.save();
  ctx.strokeStyle = color;
  ctx.globalAlpha = (opts.alpha ?? 0.28) + hpR * 0.32;
  ctx.lineWidth = opts.lineWidth ?? 1.6;
  ctx.beginPath();
  for (let i = 0; i <= segments; i++) {
    const u = i / segments;
    const t = u * turns * Math.PI * 2 + spin;
    const rr = r0 + (r1 - r0) * u;
    const x = Math.cos(t) * rr;
    const y = Math.sin(t) * rr;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.restore();
}

/** Halo fino (raio fixo; sem pulsar) */
export function drawBreathingHalo(ctx, radius, hpR, time, color, opts = {}) {
  const rr = radius * (opts.base ?? 0.92);
  ctx.save();
  ctx.strokeStyle = color;
  ctx.globalAlpha = (opts.alpha ?? 0.18) + hpR * 0.22;
  ctx.lineWidth = opts.lineWidth ?? 2;
  ctx.beginPath();
  ctx.arc(0, 0, rr, 0, Math.PI * 2);
  ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.restore();
}
