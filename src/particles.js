import { clamp } from './utils.js';

const PARTICLE_POOL_SIZE = 512;

export class ParticlePool {
  constructor() {
    this.pool = new Array(PARTICLE_POOL_SIZE).fill(null).map(() => ({
      active: false,
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      life: 0,
      decay: 1,
      radius: 1,
      color: '#fff',
      alpha: 1,
      type: 'spark', // spark | ring | debris | smoke | text

      // text-only
      text: '',
      fontSize: 14,
      strokeStyle: null,
      bold: false
    }));
    this.activeCount = 0;
  }

  emit(config) {
    // Encontra slot inativo
    for (let i = 0; i < PARTICLE_POOL_SIZE; i++) {
      const p = this.pool[i];
      if (!p.active) {
        Object.assign(p, config, { active: true, life: 1 });
        return p;
      }
    }
    // Pool cheia: simplesmente ignora nova emissão (evita churn).
    return null;
  }

  update(dt) {
    this.activeCount = 0;
    for (const p of this.pool) {
      if (!p.active) continue;
      p.life -= p.decay * dt;
      if (p.life <= 0) {
        p.active = false;
        continue;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;

      // Gravidade leve para debris/smoke.
      if (p.type === 'debris' || p.type === 'smoke') {
        p.vy += 80 * dt;
      }

      // Damping genérico (sparks perdem energia).
      if (p.type === 'spark') p.vx *= 0.98;
      this.activeCount++;
    }
  }

  render(ctx) {
    for (const p of this.pool) {
      if (!p.active) continue;
      const a = clamp(p.life, 0, 1) * p.alpha;
      ctx.globalAlpha = a;

      if (p.type === 'spark') {
        ctx.fillStyle = p.color;
        ctx.fillRect(p.x - p.radius, p.y - p.radius, p.radius * 2, p.radius * 2);
      } else if (p.type === 'ring') {
        ctx.strokeStyle = p.color;
        ctx.lineWidth = Math.max(1, p.radius * 0.08 + p.radius * 0.16 * p.life);
        const r = p.radius * (1 - p.life);
        ctx.beginPath();
        ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
        ctx.stroke();
      } else if (p.type === 'debris') {
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx.fill();
      } else if (p.type === 'smoke') {
        ctx.strokeStyle = p.color;
        ctx.lineWidth = Math.max(1, p.radius * 0.1);
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius * (1 - p.life), 0, Math.PI * 2);
        ctx.stroke();
      } else if (p.type === 'text') {
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = p.color;
        const weight = p.bold ? '800' : '600';
        ctx.font = `${weight} ${p.fontSize}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
        if (p.strokeStyle) {
          ctx.lineWidth = Math.max(2, p.fontSize * 0.08);
          ctx.strokeStyle = p.strokeStyle;
          ctx.strokeText(p.text, p.x, p.y);
        }
        ctx.fillText(p.text, p.x, p.y);
      }
    }
    ctx.globalAlpha = 1;
  }
}

