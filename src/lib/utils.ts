import * as THREE from 'three';

export const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const invLerp = (a: number, b: number, v: number) => clamp((v - a) / (b - a));
export const smoothstep = (a: number, b: number, v: number) => { const t = invLerp(a, b, v); return t * t * (3 - 2 * t); };
export const damp = (a: number, b: number, lambda: number, dt: number) => lerp(a, b, 1 - Math.exp(-lambda * dt));
export const rand = (a = 0, b = 1) => a + Math.random() * (b - a);
/** 1 inside [a,b] with soft edges of width e */
export const window01 = (t: number, a: number, b: number, e = 0.006) => smoothstep(a - e, a, t) * (1 - smoothstep(b, b + e, t));

export function mulberry32(seed: number) {
  return function () {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const ease = {
  linear: (t: number) => t,
  inOutCubic: (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  outCubic: (t: number) => 1 - Math.pow(1 - t, 3),
  inCubic: (t: number) => t * t * t,
  outBack: (t: number) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); },
  inOutSine: (t: number) => -(Math.cos(Math.PI * t) - 1) / 2,
};

/* ── Tiny tween engine, ticked from the render loop ── */
interface Tw { t: number; duration: number; e: (t: number) => number; onUpdate?: (k: number, raw: number) => void; onComplete?: () => void; resolve: () => void }
const tweens = new Set<Tw>();
export function tween({ duration = 1, delay = 0, ease: e = ease.inOutCubic, onUpdate, onComplete }: { duration?: number; delay?: number; ease?: (t: number) => number; onUpdate?: (k: number, raw: number) => void; onComplete?: () => void }) {
  return new Promise<void>((resolve) => { tweens.add({ t: -delay, duration, e, onUpdate, onComplete, resolve }); });
}
export function updateTweens(dt: number) {
  for (const tw of tweens) {
    tw.t += dt;
    if (tw.t < 0) continue;
    const k = Math.min(tw.t / tw.duration, 1);
    tw.onUpdate?.(tw.e(k), k);
    if (k >= 1) { tweens.delete(tw); tw.onComplete?.(); tw.resolve(); }
  }
}

/* ── Procedural textures ── */
export function radialGlowTexture(inner = 'rgba(255,220,160,1)', mid = 'rgba(255,140,60,0.35)', size = 128) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  const grd = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grd.addColorStop(0, inner);
  grd.addColorStop(0.18, mid);
  grd.addColorStop(0.5, 'rgba(255,90,40,0.08)');
  grd.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, size, size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function roundedRectAlpha(w = 256, h = 384, r = 22) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d')!;
  g.fillStyle = '#000'; g.fillRect(0, 0, w, h);
  g.fillStyle = '#fff';
  g.beginPath(); g.roundRect(2, 2, w - 4, h - 4, r); g.fill();
  return new THREE.CanvasTexture(c);
}

export function checkerTexture(n = 8, a = '#e8dcc0', b = '#0c0709') {
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const g = c.getContext('2d')!;
  const s = 512 / n;
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) { g.fillStyle = (x + y) % 2 ? a : b; g.fillRect(x * s, y * s, s, s); }
  for (let i = 0; i < 2600; i++) {
    g.fillStyle = `rgba(20,10,5,${Math.random() * 0.12})`;
    g.beginPath(); g.arc(Math.random() * 512, Math.random() * 512, Math.random() * 18, 0, Math.PI * 2); g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}

/** Sag between two points (string lights). */
export function sagPoints(a: THREE.Vector3, b: THREE.Vector3, sag: number, n: number) {
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const p = new THREE.Vector3().lerpVectors(a, b, t);
    p.y -= Math.sin(Math.PI * t) * sag;
    pts.push(p);
  }
  return pts;
}

/**
 * Rasterise text (or any canvas drawing) and return the lit pixels as points,
 * normalised to [-0.5, 0.5] on the long axis. Used for bulb marquees and
 * firework shapes.
 */
export function samplePoints(draw: (g: CanvasRenderingContext2D, w: number, h: number) => void, w: number, h: number, step: number, test: (r: number, g: number, b: number, a: number) => boolean = (_r, _g, _b, a) => a > 128) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d', { willReadFrequently: true })!;
  draw(g, w, h);
  const d = g.getImageData(0, 0, w, h).data;
  const out: { x: number; y: number }[] = [];
  const s = Math.max(w, h);
  for (let y = 0; y < h; y += step) {
    for (let x = 0; x < w; x += step) {
      const i = (y * w + x) * 4;
      if (test(d[i], d[i + 1], d[i + 2], d[i + 3])) out.push({ x: (x - w / 2) / s, y: -(y - h / 2) / s });
    }
  }
  return out;
}

export const isTouch = () => matchMedia('(hover: none), (pointer: coarse)').matches;
export const prefersReducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
