import { Top } from '../top.js';
import { clamp } from '../utils.js';
import { hpRatio, drawDashedEnergyRing, drawRadialMotionStrokes, drawBreathingHalo } from '../spinVisual.js';

export class Sombra extends Top {
  constructor(game, cfg) {
    super(game, cfg);
    this.ability = cfg.ability ?? {};
    this.ghostInterval = this.ability.ghostInterval ?? 1.5;
    this.ghostMax = this.ability.ghostMax ?? 2;
    this.ghostHpRatio = this.ability.ghostHpRatio ?? 0.15;
    this.ghostLife = this.ability.ghostLife ?? 3;
    this.ghostTimer = 0;
    this.ghosts = [];
  }

  onTick(dt) {
    // Limpa referências removidas
    if (this.ghosts.length) {
      this.ghosts = this.ghosts.filter(g => g && !g.remove);
    }

    this.ghostTimer += dt;
    if (this.ghostTimer < this.ghostInterval) return;
    this.ghostTimer -= this.ghostInterval;

    if (!this.game.flags.passiveParticlesEnabled) return;
    if (this.ghosts.length >= this.ghostMax) return;

    const ghostHp = this.spin * this.ghostHpRatio;
    this.ghosts.push(this.game.spawnShadowGhost(this.x, this.y, ghostHp, this.color, this.ghostLife));
  }

  renderSpinBackground(ctx) {
    super.renderSpinBackground(ctx);
    const hr = hpRatio(this);
    const t = this.game.time;
    const mist = 'rgba(180,150,255,0.95)';
    drawBreathingHalo(ctx, this.radius, hr, t, 'rgba(140,110,220,0.5)', { base: 0.94, pulses: 3, speed: 4.5 });
    drawDashedEnergyRing(ctx, this.radius, mist, hr, t, { inner: 0.62, direction: -1, alpha: 0.22 + hr * 0.4, dash: 8, gap: 10 });
    drawRadialMotionStrokes(ctx, this.radius, 14, hr, 'rgba(230,210,255,0.9)');
  }

  renderBody(ctx) {
    ctx.beginPath();
    ctx.fillStyle = this.color;
    ctx.globalAlpha = 0.72;
    ctx.arc(0, 0, this.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;

    // borda + núcleo mais denso (vida)
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, this.radius);
    g.addColorStop(0, 'rgba(255,255,255,0.12)');
    g.addColorStop(0.55, this.color);
    g.addColorStop(1, this.color);
    ctx.globalCompositeOperation = 'lighter';
    ctx.beginPath();
    ctx.arc(0, 0, this.radius * 0.92, 0, Math.PI * 2);
    ctx.fillStyle = g;
    ctx.fill();
    ctx.globalCompositeOperation = 'source-over';

    ctx.strokeStyle = 'rgba(210,200,255,0.45)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, this.radius, 0, Math.PI * 2);
    ctx.stroke();
  }
}

export class ShadowGhost extends Top {
  constructor(game, cfg) {
    super(game, cfg);
    this.immovable = true;
    this.alive = true;
    this.life = cfg.life ?? 3;
  }

  update(dt) {
    if (this.remove) return;
    this.life -= dt;
    if (this.life <= 0) this.remove = true;
  }

  onCollide(other) {
    if (this.remove) return;
    this.remove = true;
    this.game.spawnGhostDissolve(this.x, this.y, this.color);
  }

  renderSpinBackground(ctx) {
    // Fantasma estático: sem anéis de rotação (evita confundir com o dono)
  }

  renderBody(ctx) {
    ctx.beginPath();
    ctx.fillStyle = this.color;
    ctx.globalAlpha = 0.35;
    ctx.arc(0, 0, this.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = 'rgba(190,170,255,0.22)';
    ctx.lineWidth = 2;
    ctx.stroke();
  }
}

