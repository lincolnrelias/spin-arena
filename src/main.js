import { ParticlePool } from './particles.js';
import { Camera } from './camera.js';
import { createArenaBackground, renderArenaForeground } from './arena.js';
import { createHud } from './hud.js';
import { clamp, lerp } from './utils.js';

import { SpatialHash, resolveCollision, handleArenaBoundary, updateShockwaves, drawShockwaves, WAVE_POWER_SCALE } from './physics.js';
import { loadConfigFirst, mountSettingsUI, normalizeConfig, DEFAULT_CONFIG } from './config.js';
import { loadAgentStats } from './agentStats.js';

import { Espelho } from './characters/espelho.js';
import { Berserker } from './characters/berserker.js';
import { Coroa } from './characters/coroa.js';
import { Fenda } from './characters/fenda.js';
import { Sombra, ShadowGhost } from './characters/sombra.js';
import { Parasita } from './characters/parasita.js';
import { Tremor } from './characters/tremor.js';
import { Poco } from './characters/poco.js';

const FIXED_DT = 1 / 60;

const WIDTH = 1080;
const HEIGHT = 1920;
// Arena compacta (largura e altura ~ na mesma ordem; antes a altura ficava quase a tela inteira).
const ARENA_RECT = (() => {
  const w = 420;
  const h = 520;
  return { x: (WIDTH - w) / 2, y: (HEIGHT - h) / 2, w, h };
})();

class EventBus {
  constructor() {
    this.listeners = new Map();
  }
  on(event, fn) {
    if (!this.listeners.has(event)) this.listeners.set(event, []);
    this.listeners.get(event).push(fn);
  }
  emit(event, payload) {
    const list = this.listeners.get(event);
    if (!list) return;
    for (const fn of list) fn(payload);
  }
}

function parseQuery() {
  const out = {};
  const q = new URLSearchParams(window.location.search);
  for (const [k, v] of q.entries()) out[k] = v;
  return out;
}

function hexToRgb(hex) {
  const s = hex.replace('#', '').trim();
  const full = s.length === 3 ? s.split('').map(ch => ch + ch).join('') : s;
  const n = parseInt(full, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function mixHex(a, b, t) {
  const A = hexToRgb(a);
  const B = hexToRgb(b);
  const r = Math.round(lerp(A.r, B.r, t));
  const g = Math.round(lerp(A.g, B.g, t));
  const bl = Math.round(lerp(A.b, B.b, t));
  return `rgb(${r},${g},${bl})`;
}

function makeCharacterConfig(kind) {
  const raw = AGENT_STATS.get(kind);
  if (!raw) {
    // Fallback de segurança caso agents.xml não carregue.
    const legacy = {
      espelho: { displayName: 'ESPELHO', avatarChar: 'E', color: '#A8C8E8', spinMax: 800, speed: 210, mass: 1.4, radius: 26, friction: 0.0008, restitution: 0.95, ability: {} },
      berserker: { displayName: 'BERSERKER', avatarChar: 'B', color: '#E8593C', spinMax: 500, speed: 220, mass: 1.0, radius: 22, friction: 0.0015, restitution: 0.8, ability: {} },
      coroa: { displayName: 'COROA', avatarChar: 'C', color: '#E8A020', spinMax: 600, speed: 205, mass: 1.2, radius: 24, friction: 0.0012, restitution: 0.75, ability: {} },
      fenda: { displayName: 'FENDA', avatarChar: 'F', color: '#D4537E', spinMax: 700, speed: 215, mass: 1.1, radius: 23, friction: 0.001, restitution: 0.82, ability: {} },
      sombra: { displayName: 'SOMBRA', avatarChar: 'S', color: '#7B6FCC', spinMax: 450, speed: 240, mass: 0.85, radius: 20, friction: 0.0018, restitution: 0.9, ability: {} },
      parasita: { displayName: 'PARASITA', avatarChar: 'P', color: '#2A9E70', spinMax: 400, speed: 230, mass: 0.9, radius: 19, friction: 0.002, restitution: 0.7, ability: {} },
      tremor: { displayName: 'TREMOR', avatarChar: 'T', color: '#8070CC', spinMax: 520, speed: 200, mass: 1.1, radius: 22, friction: 0.0013, restitution: 0.65, ability: {} },
      poco: { displayName: 'POCO', avatarChar: 'O', color: '#1A8860', spinMax: 650, speed: 175, mass: 1.5, radius: 25, friction: 0.0009, restitution: 0.72, ability: {} }
    };
    if (!legacy[kind]) return null;
    return { kind, ...legacy[kind] };
  }
  return {
    kind,
    displayName: raw.displayName ?? kind.toUpperCase(),
    avatarChar: raw.avatarChar ?? '?',
    color: raw.color ?? '#ffffff',
    spinMax: Number(raw.spinMax ?? 500),
    speed: Number(raw.speed ?? 220),
    mass: Number(raw.mass ?? 1),
    radius: Number(raw.radius ?? 22),
    friction: Number(raw.friction ?? 0.0012),
    restitution: Number(raw.restitution ?? 0.8),
    ability: raw.ability ?? {}
  };
}

function impulseToward(top, tx, ty, impulse) {
  const dx = tx - top.x;
  const dy = ty - top.y;
  const d2 = dx * dx + dy * dy;
  if (d2 < 1e-6) return;
  const invD = 1 / Math.sqrt(d2);
  top.vx += dx * invD * impulse;
  top.vy += dy * invD * impulse;
}

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d', { alpha: false });
const hud = createHud();
const countdownEl = document.getElementById('countdown');
const resultEl = document.getElementById('result');
const resultTitleEl = document.getElementById('resultTitle');
const rematchBtn = document.getElementById('rematchBtn');

// Canvas setup (devicePixelRatio)
const dpr = Math.max(1, Math.min(3, window.devicePixelRatio || 1));
canvas.width = Math.floor(WIDTH * dpr);
canvas.height = Math.floor(HEIGHT * dpr);
canvas.style.width = `${WIDTH}px`;
canvas.style.height = `${HEIGHT}px`;
ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
ctx.imageSmoothingEnabled = false;

let bgCanvas = createArenaBackground(WIDTH, HEIGHT, ARENA_RECT);

let cfg = structuredClone(DEFAULT_CONFIG);
let settings = null;
let AGENT_STATS = new Map();

const game = {
  tops: [],
  shockwaves: [],
  particles: new ParticlePool(),
  camera: new Camera(),
  spatialHash: new SpatialHash(80),
  eventBus: new EventBus(),

  nextId: 1,
  time: 0,
  roundEndTimer: 0,
  winnerTop: null,
  resultShown: false,
  flags: { passiveParticlesEnabled: true, damageTextEnabled: true },

  prevNowMs: 0,
  /** Cooldown global compartilhado: wall-seek só reativa após X s para qualquer agente */
  wallSeekCooldown: 0,

  nextTopId() {
    return this.nextId++;
  },

  themeColorFor(top) {
    return top?.color ?? '#fff';
  },

  mixColor(a, b, t) {
    return mixHex(a, b, t);
  },

  spawnDamageText(x, y, value, color, fromTop) {
    if (!this.flags.damageTextEnabled) return;
    if (!fromTop) return;
    fromTop._damageTexts = fromTop._damageTexts ?? [];
    fromTop._damageTexts = fromTop._damageTexts.filter(p => p && p.active !== false);
    if (fromTop._damageTexts.length >= 6) return;

    const fontSize = value >= 100000 ? 24 : value >= 1000 ? 18 : 14;
    const decay = 1 / 0.8;
    const vx = (Math.random() - 0.5) * 10;
    const vy = -30 - Math.random() * 10;
    const p = this.particles.emit({
      type: 'text',
      x,
      y,
      vx,
      vy,
      radius: 1,
      color,
      alpha: 1,
      fontSize,
      strokeStyle: value >= 100000 ? 'rgba(255,255,255,0.9)' : null,
      bold: value >= 100000,
      text: Math.round(value).toString(),
      decay
    });
    if (p) fromTop._damageTexts.push(p);
  },

  spawnReflectFlash(x, y, radius) {
    // Ring branco 0..60 em ~0.3s + poucas faíscas.
    this.particles.emit({
      type: 'ring',
      x,
      y,
      vx: 0,
      vy: 0,
      radius: 60,
      color: 'rgba(255,255,255,1)',
      alpha: 1,
      decay: 1 / 0.3
    });
    const count = 12;
    for (let i = 0; i < count; i++) {
      const a = (Math.PI * 2 * i) / count;
      const sp = 60 + Math.random() * 50;
      this.particles.emit({
        type: 'spark',
        x,
        y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        radius: 2,
        color: 'rgba(255,255,255,0.95)',
        alpha: 1,
        decay: 1 / 0.12
      });
    }
  },

  spawnSparks(x, y, color, count, scale = 1) {
    const c = count ?? 1;
    for (let i = 0; i < c; i++) {
      const a = (Math.PI * 2 * i) / Math.max(1, c);
      const sp = (30 + Math.random() * 50) * scale;
      this.particles.emit({
        type: 'spark',
        x,
        y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        radius: 2,
        color,
        alpha: 1,
        decay: 1 / 0.18
      });
    }
  },

  spawnCrackSparks(x, y, other, color, count) {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 50 + Math.random() * 70;
      this.particles.emit({
        type: 'spark',
        x,
        y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        radius: 2,
        color,
        alpha: 1,
        decay: 1 / 0.2
      });
    }
  },

  spawnShockwave(x, y, power, color) {
    this.shockwaves.push({
      x,
      y,
      radius: 0,
      maxRadius: 150,
      power: Math.max(0, power),
      age: 0,
      duration: 0.4,
      hits: new Set(),
      color: color ?? 'rgba(180,120,255,0.85)'
    });
  },

  spawnShockwaveHitFlash(x, y, color) {
    // ring pequeno + 4 sparks
    this.particles.emit({
      type: 'ring',
      x,
      y,
      vx: 0,
      vy: 0,
      radius: 28,
      color,
      alpha: 0.9,
      decay: 1 / 0.22
    });
    for (let i = 0; i < 6; i++) {
      const a = (Math.PI * 2 * i) / 6;
      const sp = 40 + Math.random() * 30;
      this.particles.emit({
        type: 'spark',
        x,
        y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        radius: 2,
        color,
        alpha: 1,
        decay: 1 / 0.14
      });
    }
  },

  spawnCrownFlash(x, y, color) {
    this.particles.emit({
      type: 'ring',
      x,
      y,
      radius: 60,
      color,
      alpha: 0.9,
      decay: 1 / 0.26
    });
    for (let i = 0; i < 14; i++) {
      const a = (Math.PI * 2 * i) / 14;
      const sp = 40 + Math.random() * 60;
      this.particles.emit({
        type: 'spark',
        x,
        y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        radius: 2,
        color,
        alpha: 1,
        decay: 1 / 0.18
      });
    }
  },

  spawnGhostDissolve(x, y, color) {
    for (let i = 0; i < 8; i++) {
      const a = (Math.PI * 2 * i) / 8;
      const sp = 20 + Math.random() * 60;
      this.particles.emit({
        type: 'spark',
        x,
        y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        radius: 2,
        color,
        alpha: 1,
        decay: 1 / 0.14
      });
    }
  },

  spawnFendaSplitExplosion(x, y, color) {
    // Flash branco + 20 debris explosivos.
    this.particles.emit({
      type: 'ring',
      x,
      y,
      radius: 55,
      color: 'rgba(255,255,255,0.95)',
      alpha: 1,
      decay: 1 / 0.22
    });
    for (let i = 0; i < 20; i++) {
      const a = (Math.PI * 2 * i) / 20;
      const sp = 90 + Math.random() * 80;
      this.particles.emit({
        type: 'debris',
        x,
        y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        radius: 3,
        color,
        alpha: 1,
        decay: 1 / 0.55
      });
    }
  },

  spawnFinalExplosion(top) {
    const spinMax = top.spinMax ?? 1;
    const shakeMag = clamp(spinMax / 120, 2, 18);
    this.camera.shake(shakeMag);

    // 20 debris
    for (let i = 0; i < 20; i++) {
      const a = (Math.PI * 2 * i) / 20;
      const sp = 120 + Math.random() * 70;
      this.particles.emit({
        type: 'debris',
        x: top.x,
        y: top.y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        radius: 3,
        color: top.color,
        alpha: 1,
        decay: 1 / 0.7
      });
    }

    // 3 rings expansivos
    for (let k = 0; k < 3; k++) {
      this.particles.emit({
        type: 'ring',
        x: top.x,
        y: top.y,
        radius: 60 + k * 22,
        color: top.color,
        alpha: 0.65,
        decay: 1 / (0.26 + k * 0.05)
      });
    }

    const winnerName = this.winnerTop && this.winnerTop !== top ? this.winnerTop.displayName : 'ELIMINATED';
    this.particles.emit({
      type: 'text',
      x: top.x,
      y: top.y - 40,
      vx: 0,
      vy: -10,
      radius: 1,
      color: top.color,
      alpha: 1,
      fontSize: 28,
      strokeStyle: 'rgba(255,255,255,0.9)',
      bold: true,
      text: winnerName,
      decay: 1 / 0.8
    });
  },

  spawnShadowGhost(x, y, ghostHp, shadowColor, ghostLife = 3) {
    const sombraCfg = makeCharacterConfig('sombra');
    const hp = Math.max(1, ghostHp);
    const ghost = new ShadowGhost(this, {
      kind: 'sombra_ghost',
      displayName: 'Ghost',
      avatarChar: 'G',
      color: shadowColor,
      x,
      y,
      vx: 0,
      vy: 0,
      spinMax: hp,
      spin: hp,
      radius: sombraCfg.radius * 0.95,
      mass: sombraCfg.mass * 0.7,
      friction: 0,
      restitution: sombraCfg.restitution,
      immovable: true,
      life: ghostLife
    });
    this.tops.push(ghost);
    return ghost;
  },

  // Helpers para criação de tops
  spawnTop(kind, cfg) {
    const base = makeCharacterConfig(kind);
    if (!base) throw new Error(`Unknown kind: ${kind}`);

    const classMap = {
      espelho: Espelho,
      berserker: Berserker,
      coroa: Coroa,
      fenda: Fenda,
      sombra: Sombra,
      parasita: Parasita,
      tremor: Tremor,
      poco: Poco
    };

    const Cls = classMap[kind];
    if (!Cls) throw new Error(`No class for kind: ${kind}`);

    const top = new Cls(this, {
      ...base,
      ...cfg,
      spinMax: cfg.spinMax ?? base.spinMax,
      radius: cfg.radius ?? base.radius,
      mass: cfg.mass ?? base.mass,
      friction: cfg.friction ?? base.friction,
      restitution: cfg.restitution ?? base.restitution,
      spin: cfg.spin ?? (cfg.spinMax ?? base.spinMax),
      nemesis: cfg.nemesis ?? null
    });
    this.tops.push(top);
    return top;
  },

  spawnFendaChild(dir, opts) {
    const x = opts.parentX + opts.perpX * dir * opts.parentRadius;
    const y = opts.parentY + opts.perpY * dir * opts.parentRadius;
    const speed = opts.speed ?? 200;
    const splitSpeedMult = opts.splitSpeedMult ?? 0.6;
    const vx = opts.parentVx + opts.perpX * speed * splitSpeedMult;
    const vy = opts.parentVy + opts.perpY * speed * splitSpeedMult;

    return this.spawnTop('fenda', {
      x,
      y,
      vx,
      vy,
      spinMax: opts.childSpinMax,
      mass: opts.childMass,
      radius: opts.childRadius,
      generation: opts.childGeneration ?? 1,
      nemesis: opts.nemesis
    });
  },

  // Round setup
  resetRound() {
    this.tops = [];
    this.shockwaves = [];
    this.particles = new ParticlePool();
    this.camera = new Camera();
    this.spatialHash = new SpatialHash(80);
    this.nextId = 1;
    this.time = 0;
    this.roundEndTimer = 0;
    this.winnerTop = null;
    this.resultShown = false;
    this.wallSeekCooldown = 0;
  }
};

let state = 'countdown'; // countdown | fight | results
let countdownAge = 0;

game.eventBus.on('death', ({ top, killer }) => {
  if (game.winnerTop) return; // já decidido

  // Em 1v1: o vencedor é o único top ainda "alive".
  const remaining = game.tops.filter(t => t !== top && t.alive && !t.remove);
  const winner = remaining[0] ?? (killer && killer.alive ? killer : null);
  if (!winner) return;

  game.winnerTop = winner;
  game.roundEndTimer = 0;
  state = 'results';

  if (killer && killer.kind === 'coroa') {
    // +1 stack ao eliminar (dentro da partida) + persistência simples.
    killer.gainStack();
    const prev = Number(sessionStorage.getItem('topsroyale_coroa_elims') ?? '0');
    sessionStorage.setItem('topsroyale_coroa_elims', String(prev + 1));
  }

  hud.setEventLog(`${winner.displayName} venceu o confronto!`);
});

function setCountdownText(n) {
  countdownEl.style.opacity = '1';
  countdownEl.textContent = n;
}

function startCountdown() {
  state = 'countdown';
  countdownAge = 0;
  countdownEl.style.opacity = '1';
  countdownEl.textContent = '3';
  resultEl.style.opacity = '0';
}

function initTopsFromConfig() {
  const q = parseQuery();
  const aKind = (q.a ?? 'espelho').toLowerCase();
  const bKind = (q.b ?? 'berserker').toLowerCase();
  const cy = ARENA_RECT.y + ARENA_RECT.h * 0.5;
  const aBase = makeCharacterConfig(aKind);
  const bBase = makeCharacterConfig(bKind);
  const aSpeed = aBase?.speed ?? 220;
  const bSpeed = bBase?.speed ?? 220;

  game.spawnTop(aKind, {
    x: ARENA_RECT.x + ARENA_RECT.w * 0.28,
    y: cy,
    vx: aSpeed,
    vy: -aSpeed * 0.33
  });
  game.spawnTop(bKind, {
    x: ARENA_RECT.x + ARENA_RECT.w * 0.72,
    y: cy,
    vx: -bSpeed,
    vy: bSpeed * 0.33
  });
}

function computeRenderFlags() {
  const agentCount = game.tops.length;
  game.flags.passiveParticlesEnabled = agentCount <= 50;
  game.flags.damageTextEnabled = agentCount <= 20; // evita poluição em lutas maiores
}

function update(dt) {
  if (state === 'countdown') {
    countdownAge += dt;
    const n = 3 - Math.floor(countdownAge);
    if (n >= 1 && n <= 3) setCountdownText(n);
    if (countdownAge >= 3) {
      state = 'fight';
      countdownEl.style.opacity = '0';
      countdownEl.textContent = '';
    }
    return;
  }

  if (state === 'results') {
    // Física parada: apenas animações de morte continuam.
    game.time += dt;

    for (const t of game.tops) {
      if (t.remove) continue;
      if (t.dead) t.update(dt);
    }

    game.particles.update(dt);
    game.tops = game.tops.filter(t => !t.remove);

    // overlay após 1.5s do início da morte.
    if (game.winnerTop && !game.resultShown) {
      game.roundEndTimer += dt;
      if (game.roundEndTimer >= 1.5) {
        game.resultShown = true;
        resultEl.style.opacity = '1';
        resultTitleEl.textContent = game.winnerTop.displayName;
      }
    }
    return;
  }

  // Fixed timestep simulation
  computeRenderFlags();
  game.time += dt;

  // Shockwaves primeiro (afetam spin e velocidades neste tick)
  updateShockwaves(game, dt, game.tops);

  // Salva prevs para interpolação do render
  for (const t of game.tops) {
    t.prevX = t.prevX ?? t.x;
    t.prevY = t.prevY ?? t.y;
    t.prevAngle = t.prevAngle ?? t.angle;
    t.prevSpin = t.prevSpin ?? t.spin;
    t.prevHp = t.prevHp ?? t.hp;
    t.prevX = t.x;
    t.prevY = t.y;
    t.prevAngle = t.angle;
    t.prevSpin = t.spin;
    t.prevHp = t.hp;
  }

  // Atualiza tops (movimento, spin decay, onTick, morte)
  for (const t of game.tops) {
    // Leeches (Parasita) fica no update do Top base.
    t.update(dt);
  }

  // Boundary (arena) e tratamento especial (sacudir leeches)
  for (const t of game.tops) {
    if (!t.alive || t.remove) continue;
    const impact = handleArenaBoundary(t, ARENA_RECT);
    if (impact > 0) {
      // Wall-seek: ao bater na borda, impulso linear para o inimigo mais próximo.
      // Cooldown compartilhado: um disparo por janela para toda a arena.
      const W = cfg.wallSeek;
      if (W.enabled && W.impulse > 0 && !t.immovable && game.wallSeekCooldown <= 0) {
        let target = null;
        let bestD2 = Infinity;
        for (const o of game.tops) {
          if (o === t) continue;
          if (!o.alive || o.remove) continue;
          if (o.immovable) continue;
          if (o.kind === 'sombra_ghost') continue;
          const dx = o.x - t.x;
          const dy = o.y - t.y;
          const d2 = dx * dx + dy * dy;
          if (d2 < bestD2) {
            bestD2 = d2;
            target = o;
          }
        }
        if (target) {
          const speedFactor = (t.speed ?? 220) / 220;
          impulseToward(t, target.x, target.y, W.impulse * speedFactor);
          game.wallSeekCooldown = W.cooldown;
        }
      }

      // Tremor reage a bordas
      if (typeof t.onArenaBoundary === 'function') t.onArenaBoundary(impact);
      // Parasita: sacode leeches ao bater na arena
      if (t.leeches && t.leeches.length) t.leeches = [];
    }
  }

  if (game.wallSeekCooldown > 0) game.wallSeekCooldown = Math.max(0, game.wallSeekCooldown - dt);

  // Spatial hashing + colisões
  game.spatialHash.clear();
  for (const t of game.tops) {
    if (t.alive && !t.remove) game.spatialHash.insert(t);
  }

  const tops = game.tops;
  for (const a of tops) {
    if (!a.alive || a.remove) continue;
    const candidates = game.spatialHash.query(a);
    for (const b of candidates) {
      if (b === a || !b.alive || b.remove) continue;
      if (b.id <= a.id) continue;
      resolveCollision(a, b);
    }
  }

  // Checa mortes após spinDamage por colisões/bordas.
  for (const t of game.tops) {
    if (!t.alive || t.remove) continue;
    const threshold = t.spinMax * 0.02;
    if (!t.dead && t.spin <= threshold) t.startDeath();
  }

  // Remove tops que já terminaram animação.
  game.tops = game.tops.filter(t => !t.remove);

  // Atualiza partículas
  game.particles.update(dt);

  // overlay fica a cargo do ramo state==='results'
}

function render(alpha) {
  // Limpa fundo
  ctx.clearRect(0, 0, WIDTH, HEIGHT);
  ctx.drawImage(bgCanvas, 0, 0);

  renderArenaForeground(ctx, ARENA_RECT);

  // camera shake
  ctx.save();
  game.camera.apply(ctx);

  // Shockwaves
  drawShockwaves(ctx, game.shockwaves);

  // Orçamento visual
  const agentCount = game.tops.length;
  const showShadow = agentCount <= 8;
  const showHpRing = agentCount <= 20;

  // Tops (render com interpolação)
  for (const t of game.tops) {
    const rx = lerp(t.prevX ?? t.x, t.x, alpha);
    const ry = lerp(t.prevY ?? t.y, t.y, alpha);
    const ra = lerp(t.prevAngle ?? t.angle, t.angle, alpha);
    const rhp = lerp(t.prevHp ?? t.hp, t.hp, alpha);
    t.render(ctx, { agentCount, showShadow, showHpRing, x: rx, y: ry, angle: ra, hp: rhp, alpha });
  }

  // Partículas (em cima)
  game.particles.render(ctx);

  game.camera.restore(ctx);
  ctx.restore();
}

let lastTs = 0;
let accumulator = 0;
function loop(ts) {
  if (!lastTs) lastTs = ts;
  const dt = Math.min((ts - lastTs) / 1000, 0.05);
  lastTs = ts;
  accumulator += dt;

  while (accumulator >= FIXED_DT) {
    update(FIXED_DT);
    accumulator -= FIXED_DT;
  }
  const alpha = accumulator / FIXED_DT;
  game.camera.update(dt);
  render(alpha);
  requestAnimationFrame(loop);
}

function startNewMatch() {
  game.resetRound();
  bgCanvas = createArenaBackground(WIDTH, HEIGHT, ARENA_RECT);
  // Corrige referências DOM
  hud.setEventLog('');
  state = 'countdown';
  resultEl.style.opacity = '0';
  initTopsFromConfig();
  startCountdown();
  // Configura câmera com zero shakes
  game.camera.shakeMag = 0;
  accumulator = 0;
  lastTs = 0;
}

rematchBtn.addEventListener('click', () => startNewMatch());
window.addEventListener('keydown', (e) => {
  if (e.key === 'r' || e.key === 'R') startNewMatch();
});

// Boot: carrega config (localStorage -> /config.json -> defaults), monta UI e inicia match.
(async function boot() {
  AGENT_STATS = await loadAgentStats();
  cfg = normalizeConfig(await loadConfigFirst());
  settings = mountSettingsUI(cfg, (nextCfg) => {
    cfg = normalizeConfig(nextCfg);
  });
  startNewMatch();
  requestAnimationFrame(loop);
})();

