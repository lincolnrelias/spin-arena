/**
 * Fundo da arena + contorno da zona de jogo (retangular).
 * Evita gradiente radial no ecrã inteiro — isso fazia a zona parecer circular.
 * @param {number} width
 * @param {number} height
 * @param {{ x: number, y: number, w: number, h: number }} arenaRect
 */
export function renderArenaBackground(ctx, width, height, arenaRect) {
  if (!ctx) return;
  const ar = arenaRect ?? { x: (width - 420) / 2, y: (height - 520) / 2, w: 420, h: 520 };
  const { x: ax, y: ay, w: aw, h: ah } = ar;

  // Margens fora da arena: escuro uniforme (sem “spot” circular no centro do ecrã).
  ctx.fillStyle = '#04040a';
  ctx.fillRect(0, 0, width, height);

  // Chão da arena: só dentro do retângulo, gradiente linear (vertical) — lê-se como caixa.
  const floorGrad = ctx.createLinearGradient(ax, ay, ax, ay + ah);
  floorGrad.addColorStop(0, 'rgba(28, 28, 44, 1)');
  floorGrad.addColorStop(0.45, 'rgba(14, 14, 26, 1)');
  floorGrad.addColorStop(1, 'rgba(8, 8, 18, 1)');
  ctx.fillStyle = floorGrad;
  ctx.fillRect(ax, ay, aw, ah);

  // Borda estática bem visível + textura leve (sem formas circulares).
  ctx.strokeStyle = 'rgba(255,255,255,0.65)';
  ctx.lineWidth = 4;
  ctx.strokeRect(ax, ay, aw, ah);

  ctx.globalAlpha = 0.4;
  for (let i = 0; i < 4; i++) {
    const t = 0.05 + i * 0.08;
    const inset = t * Math.min(aw, ah) * 0.4;
    ctx.setLineDash([10, 12]);
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = 'rgba(255,255,255,0.18)';
    ctx.strokeRect(ax + inset, ay + inset, aw - 2 * inset, ah - 2 * inset);
  }
  ctx.setLineDash([]);
  ctx.globalAlpha = 1;
}

export function createArenaBackground(width, height, arenaRect) {
  const bg = document.createElement('canvas');
  bg.width = width;
  bg.height = height;
  const g = bg.getContext('2d');
  if (!g) return bg;

  renderArenaBackground(g, width, height, arenaRect);
  return bg;
}

/**
 * Borda por cima do jogo (reforço — mesma geometria que a física).
 * @param {CanvasRenderingContext2D} ctx
 * @param {{ x: number, y: number, w: number, h: number }} arenaRect
 */
export function renderArenaForeground(ctx, arenaRect) {
  if (!arenaRect || arenaRect.w == null) return;
  const { x, y, w, h } = arenaRect;

  ctx.save();
  ctx.strokeStyle = 'rgba(255,255,255,0.85)';
  ctx.lineWidth = 3;
  ctx.strokeRect(x, y, w, h);

  ctx.strokeStyle = 'rgba(120, 255, 200, 0.45)';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(x + 4, y + 4, w - 8, h - 8);

  // Cantos em L — reforçam que a zona é um retângulo.
  const L = 18;
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + L, y);
  ctx.moveTo(x, y);
  ctx.lineTo(x, y + L);
  ctx.moveTo(x + w, y);
  ctx.lineTo(x + w - L, y);
  ctx.moveTo(x + w, y);
  ctx.lineTo(x + w, y + L);
  ctx.moveTo(x, y + h);
  ctx.lineTo(x + L, y + h);
  ctx.moveTo(x, y + h);
  ctx.lineTo(x, y + h - L);
  ctx.moveTo(x + w, y + h);
  ctx.lineTo(x + w - L, y + h);
  ctx.moveTo(x + w, y + h);
  ctx.lineTo(x + w, y + h - L);
  ctx.stroke();

  ctx.restore();
}
