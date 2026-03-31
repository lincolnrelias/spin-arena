export function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function smoothstep(t) {
  t = clamp(t, 0, 1);
  return t * t * (3 - 2 * t);
}

export function lenSq(x, y) {
  return x * x + y * y;
}

export function len(x, y) {
  return Math.sqrt(x * x + y * y);
}

export function randRange(a, b) {
  return a + Math.random() * (b - a);
}

