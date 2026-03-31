export class Camera {
  constructor() {
    this.shakeX = 0;
    this.shakeY = 0;
    this.shakeMag = 0;
    this.shakeDecay = 8; // decai por segundo
  }

  shake(magnitude) {
    this.shakeMag = Math.min(this.shakeMag + magnitude, 20);
  }

  calibrateFromImpact(impactForce) {
    if (impactForce < 50) this.shake(1);
    else if (impactForce < 200) this.shake(4);
    else if (impactForce < 500) this.shake(8);
    else this.shake(14);
  }

  impactDeath() {
    this.shake(18);
  }

  update(dt) {
    if (this.shakeMag < 0.1) {
      this.shakeMag = 0;
      this.shakeX = 0;
      this.shakeY = 0;
      return;
    }
    // Pequena aleatoriedade: aceita como estética (não afeta física).
    this.shakeX = (Math.random() - 0.5) * 2 * this.shakeMag;
    this.shakeY = (Math.random() - 0.5) * 2 * this.shakeMag;
    this.shakeMag -= this.shakeDecay * dt;
  }

  apply(ctx) {
    if (this.shakeMag <= 0) return;
    ctx.save();
    ctx.translate(this.shakeX, this.shakeY);
  }

  restore(ctx) {
    ctx.restore();
  }
}

