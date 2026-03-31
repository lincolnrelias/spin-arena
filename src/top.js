import { clamp, lerp } from './utils.js';
import { hpRatio, visualAngularVelocity, drawHpSweepArc, drawSpinTopFromAbove } from './spinVisual.js';

const DEATH_RATIO = 0.02; // spin < 2% do spinMax => morte
/** Sem perda de vida ao longo do tempo: só colisões / habilidades alteram spin */
const LINEAR_DAMP_PER_TICK = 0.9993;

export class Top {
  constructor(game, cfg) {
    this.game = game;

    this.id = game.nextTopId();
    this.kind = cfg.kind;
    this.displayName = cfg.displayName ?? cfg.kind;
    this.avatarChar = cfg.avatarChar ?? '?';
    this.color = cfg.color ?? '#fff';
    this.rimColor = cfg.rimColor ?? null;

    // Movimento / estado visual
    this.x = cfg.x;
    this.y = cfg.y;
    this.vx = cfg.vx ?? 0;
    this.vy = cfg.vy ?? 0;
    this.speed = cfg.speed ?? 220;
    this.angle = 0;

    // spin/HP
    this.spinMax = cfg.spinMax;
    this.spin = cfg.spin;
    this.hpMax = this.spinMax;
    this.hp = this.spin;

    // física
    this.radius = cfg.radius;
    this.mass = cfg.mass;
    this.friction = cfg.friction ?? 0; // reservado; sem decay passivo de spin
    this.restitution = cfg.restitution;

    // flags
    this.alive = true; // participa da colisão/loop de física
    this.dead = false; // sequência visual em andamento
    this.remove = false; // pronto pra remover da lista
    this.immovable = !!cfg.immovable;

    // wobble: métrica de HP baixo (sombra); sem inclinar o pião no jogo (só rotação pura)
    this.wobble = 0;
    this.tiltAngle = 0;

    // habilidade / metadados
    this.lastDamageSource = null;
    this.nemesis = cfg.nemesis ?? null;
    this.leeches = []; // alvos "sucados" guardam leeches aqui
    this.stats = {
      collisions: 0,
      timeSurvived: 0,
      totalDamageDealt: 0,
      totalDamageReceived: 0
    };

    // visual scaling (para habilidades específicas)
    this.visualScale = 1;

    // death animation
    this.deathAge = 0;
    this.deathSpawnedFinal = false;
    this.deathSpinStart = this.spin;
    this.deathRadiusScale = 1;
    this.deathOpacity = 1;
    this.deathTiltStart = 0;

    // Subclasses podem sobrescrever
    this.frozenAfterDeath = true;
  }

  // Hook opcional
  onCollide(other, impactForce, nx, ny) {}
  onTick(dt) {}
  onDeath() {}

  // Hook de desenho (desenhar centrado em (0,0) e considerando ctx já transformado)
  renderBody(ctx) {
    drawSpinTopFromAbove(ctx, this.radius, {
      body: this.color,
      rim: this.rimColor,
      innerGroove: 'rgba(0,0,0,0.25)'
    });
  }

  renderExtras(ctx) {
    // por padrão: nada
  }

  /**
   * Desenho em espaço de mundo, por baixo do corpo do próprio pião.
   * Use para efeitos que devem ficar atrás do agente (ex.: cabos/tentáculos).
   */
  renderWorldUnderExtras(ctx, opts) {}

  /**
   * Desenho em espaço de mundo (após restaurar translate/rotate do pião).
   * Use para linhas entre agentes, feixes, etc.
   */
  renderWorldExtras(ctx, opts) {}

  /** Camada atrás do corpo — subclasses podem chamar super e enriquecer */
  renderSpinBackground(ctx) {
    const hr = hpRatio(this);
    drawHpSweepArc(ctx, this.radius, hr, this.color);
  }

  startDeath() {
    if (this.dead || this.remove) return;
    this.dead = true;
    this.alive = false;
    this.deathAge = 0;
    this.deathSpawnedFinal = false;
    this.deathSpinStart = this.spin;
    this.deathTiltStart = this.tiltAngle;
    this.spin = Math.max(0, this.spin);
    this.vx = 0;
    this.vy = 0;
    this.leeches = [];
    this.onDeath();
    this.game.eventBus.emit('death', { top: this, killer: this.lastDamageSource });
  }

  applyLeeches(dt) {
    if (!this.leeches || this.leeches.length === 0) return;
    const arr = this.leeches;
    const next = [];
    for (let i = 0; i < arr.length; i++) {
      const l = arr[i];
      if (!l) continue;

      if (l.filamentType === 'parasita') {
        const src = l.source;
        if (!src || !src.alive || src.remove || src.dead) {
          continue;
        }

        l.acc = (l.acc ?? 0) + dt;
        l.pulseGlow = (l.pulseGlow ?? 0) * Math.exp(-dt * 7);

        while (l.pulsesDone < l.totalPulses && l.acc >= l.pulseInterval) {
          l.acc -= l.pulseInterval;
          const dmg = Math.min(l.drainPerPulse, Math.max(0, this.spin));
          if (dmg > 1e-6) {
            this.spin -= dmg;
            const hr = l.healRatio ?? 0.5;
            src.spin = Math.min(src.spinMax, src.spin + dmg * hr);
          }
          l.pulsesDone++;
          l.pulseGlow = 1;
        }

        if (l.pulsesDone < l.totalPulses) next.push(l);
        continue;
      }

      // Legado (dreno contínuo), se existir
      l.elapsed += dt;
      const drain = l.drainRate * dt;
      this.spin -= drain;
      if (l.source && l.source.alive) {
        const healRatio = l.healRatio ?? 0.5;
        l.source.spin = Math.min(l.source.spin + drain * healRatio, l.source.spinMax);
      }
      if (l.elapsed < l.duration) next.push(l);
    }
    this.leeches = next;
  }

  update(dt) {
    if (this.remove) return;

    if (this.dead) {
      this.updateDeath(dt);
      return;
    }

    // Leeches drenar-curar acontece mesmo antes da rotação e da física linear.
    this.applyLeeches(dt);

    // Hook habilidade (pode ajustar velocidades etc).
    this.onTick(dt);

    // Movimento e visual
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    // Rotação visual = leitor de "vida": HP cheio = giro confortável; HP baixo = desacelera
    this.angle += visualAngularVelocity(this, {
      mult: this.game?.config?.spinVisualMult ?? 3
    }) * dt;

    // Atrito no chão (linear)
    // Damping linear mais suave para evitar que tops "morram no movimento".
    const linearDamp = Math.pow(LINEAR_DAMP_PER_TICK, 60 * dt);
    this.vx *= linearDamp;
    this.vy *= linearDamp;

    // Speed floor/cap por agente:
    // - floor: nunca deixa cair abaixo do speed base configurado
    // - cap: limita picos exagerados de velocidade linear
    const speedNow = Math.sqrt(this.vx * this.vx + this.vy * this.vy);
    const minSpeed = this.speed;
    const maxSpeed = this.speed * 2.4;
    if (speedNow > 0.0001 && speedNow < minSpeed) {
      const s = minSpeed / speedNow;
      this.vx *= s;
      this.vy *= s;
    } else if (speedNow > maxSpeed && speedNow > 0.0001) {
      const s = maxSpeed / speedNow;
      this.vx *= s;
      this.vy *= s;
    }

    // hp derivado do spin (sem decay passivo)
    this.hp = this.spin; // hpMax == spinMax por design do spec

    if (this.spinMax > 0) {
      this.wobble = clamp(1 - this.spin / this.spinMax, 0, 1);
    }
    this.tiltAngle = 0;

    this.stats.timeSurvived += dt;

    // Morte
    const deathThreshold = this.spinMax * DEATH_RATIO;
    if (this.spin <= deathThreshold) this.startDeath();
  }

  updateDeath(dt) {
    this.deathAge += dt;

    // spin desce até 0 no "espiral"
    const wobbleT = clamp(this.deathAge / 0.3, 0, 1);
    // wobble vai de atual -> 1 rapidamente
    this.wobble = lerp(this.wobble, 1, wobbleT);

    // "espiral de queda": 0.3s..1.1s (0.8s)
    const spiralT = clamp((this.deathAge - 0.3) / 0.8, 0, 1);
    this.spin = lerp(this.deathSpinStart, 0, spiralT);

    // tilt vai até PI/2
    this.tiltAngle = lerp(this.deathTiltStart, Math.PI / 2, spiralT);

    // raio visual encolhe
    this.deathRadiusScale = lerp(1, 0, spiralT);

    // Opacidade: 1 até 0.8s, depois cai 0.3s
    const opacityT = clamp((this.deathAge - 0.8) / 0.3, 0, 1);
    this.deathOpacity = 1 - opacityT;

    this.hp = this.spin;

    if (!this.deathSpawnedFinal && spiralT >= 1) {
      this.deathSpawnedFinal = true;
      this.game.spawnFinalExplosion(this);
    }

    if (this.deathAge > 2.2) {
      this.remove = true;
    }
  }

  render(ctx, opts) {
    if (this.remove) return;

    const agentCount = opts.agentCount;
    const showShadow = opts.showShadow;
    const showHpRing = opts.showHpRing;
    const x = opts.x ?? this.x;
    const y = opts.y ?? this.y;
    const angle = opts.angle ?? this.angle;
    const hp = opts.hp ?? this.hp;

    const renderOpacity = this.dead ? this.deathOpacity : 1;

    // Sombra no chão (não durante death)
    if (showShadow && !this.dead) {
      const shadowAlpha = clamp(0.12 + this.wobble * 0.28, 0, 0.35);
      ctx.save();
      ctx.globalAlpha = shadowAlpha;
      ctx.translate(x, y);
      ctx.scale(1, 0.3);
      ctx.beginPath();
      ctx.arc(0, 0, this.radius * 1.2, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(0,0,0,0.65)';
      ctx.fill();
      ctx.restore();
    }

    const scale = (this.dead ? this.deathRadiusScale : 1) * (this.visualScale || 1);

    // Extras em mundo por baixo do corpo do agente
    ctx.save();
    ctx.globalAlpha = renderOpacity;
    this.renderWorldUnderExtras(ctx, {
      x,
      y,
      angle,
      hp,
      alpha: opts.alpha ?? 1,
      renderOpacity
    });
    ctx.restore();

    ctx.save();
    ctx.globalAlpha = renderOpacity;
    ctx.translate(x, y);
    ctx.rotate(this.tiltAngle);
    ctx.rotate(angle);
    ctx.scale(scale, scale);

    if (!this.dead) this.renderSpinBackground(ctx);
    this.renderBody(ctx);
    this.renderExtras(ctx);
    ctx.restore();

    ctx.save();
    ctx.globalAlpha = renderOpacity;
    this.renderWorldExtras(ctx, {
      x,
      y,
      angle,
      hp,
      alpha: opts.alpha ?? 1,
      renderOpacity
    });
    ctx.restore();

    // Anel de HP (independente de rotação)
    if (showHpRing && this.spinMax > 0) {
      const t = clamp(hp / this.hpMax, 0, 1);
      const ringR = this.radius + 6 * (this.dead ? this.deathRadiusScale : 1);
      const col = t > 0.5 ? `hsl(${120 * (t - 0.5) * 2}, 80%, 55%)` : `hsl(${120 * t * 2}, 80%, 55%)`;
      ctx.save();
      ctx.globalAlpha = renderOpacity * 0.35;
      ctx.beginPath();
      ctx.arc(x, y, ringR + 2, 0, Math.PI * 2);
      ctx.strokeStyle = col;
      ctx.lineWidth = 8;
      ctx.stroke();
      ctx.restore();
      ctx.save();
      ctx.globalAlpha = renderOpacity;
      ctx.beginPath();
      ctx.arc(x, y, ringR, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * t);
      ctx.strokeStyle = col;
      ctx.lineWidth = 4;
      ctx.lineCap = 'round';
      ctx.stroke();
      ctx.restore();
    }
  }
}

