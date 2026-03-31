export function createArenaBackground(width, height) {
  const bg = document.createElement('canvas');
  bg.width = width;
  bg.height = height;
  const g = bg.getContext('2d');

  // Fundo simples com gradiente radial.
  const cx = width / 2;
  const cy = height / 2;
  const grad = g.createRadialGradient(cx, cy, 0, cx, cy, Math.min(width, height) * 0.6);
  grad.addColorStop(0, 'rgba(24, 24, 40, 1)');
  grad.addColorStop(0.4, 'rgba(9, 9, 18, 1)');
  grad.addColorStop(1, 'rgba(0, 0, 0, 1)');
  g.fillStyle = grad;
  g.fillRect(0, 0, width, height);

  // Anel de arena (estático).
  const ARENA_RADIUS = 350;
  g.strokeStyle = 'rgba(255,255,255,0.16)';
  g.lineWidth = 3;
  g.beginPath();
  g.arc(cx, cy, ARENA_RADIUS, 0, Math.PI * 2);
  g.stroke();

  // Linhas pontilhadas internas para "textura".
  g.globalAlpha = 0.35;
  for (let i = 0; i < 4; i++) {
    const r = ARENA_RADIUS * (0.2 + i * 0.17);
    g.setLineDash([8, 10]);
    g.strokeStyle = 'rgba(255,255,255,0.12)';
    g.beginPath();
    g.arc(cx, cy, r, 0, Math.PI * 2);
    g.stroke();
  }
  g.setLineDash([]);
  g.globalAlpha = 1;

  return bg;
}

export function renderArenaForeground(ctx, width, height, arenaRadius) {
  const cx = width / 2;
  const cy = height / 2;

  // Linha externa com "brilho" leve.
  ctx.save();
  ctx.strokeStyle = 'rgba(255,255,255,0.22)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(cx, cy, arenaRadius, 0, Math.PI * 2);
  ctx.stroke();

  ctx.strokeStyle = 'rgba(20, 255, 180, 0.12)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(cx, cy, arenaRadius - 5, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

