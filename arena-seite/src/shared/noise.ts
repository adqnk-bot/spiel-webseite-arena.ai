/**
 * Deterministische Zufallswerte und Wertrauschen.
 * Nur 32-Bit-Integer-Arithmetik, damit jeder Client und Host exakt dasselbe Ergebnis bekommt.
 */

/** Hash von drei ganzzahligen Koordinaten plus Seed. Ergebnis in [0, 1). */
export function hash3(ix: number, iy: number, iz: number, seed: number): number {
  let h = seed | 0;
  h = Math.imul(h ^ ix, 0x27d4eb2d);
  h = Math.imul(h ^ iy, 0x165667b1);
  h = Math.imul(h ^ iz, 0x9e3779b1);
  h ^= h >>> 15;
  h = Math.imul(h, 0x85ebca77);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae3d);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

function fade(t: number): number {
  return t * t * (3 - 2 * t);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Wertrauschen in 3D, Ergebnis in [0, 1). */
export function valueNoise3(x: number, y: number, z: number, seed: number): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const z0 = Math.floor(z);
  const u = fade(x - x0);
  const v = fade(y - y0);
  const w = fade(z - z0);

  const c000 = hash3(x0, y0, z0, seed);
  const c100 = hash3(x0 + 1, y0, z0, seed);
  const c010 = hash3(x0, y0 + 1, z0, seed);
  const c110 = hash3(x0 + 1, y0 + 1, z0, seed);
  const c001 = hash3(x0, y0, z0 + 1, seed);
  const c101 = hash3(x0 + 1, y0, z0 + 1, seed);
  const c011 = hash3(x0, y0 + 1, z0 + 1, seed);
  const c111 = hash3(x0 + 1, y0 + 1, z0 + 1, seed);

  const x00 = lerp(c000, c100, u);
  const x10 = lerp(c010, c110, u);
  const x01 = lerp(c001, c101, u);
  const x11 = lerp(c011, c111, u);
  const y0v = lerp(x00, x10, v);
  const y1v = lerp(x01, x11, v);
  return lerp(y0v, y1v, w);
}

/** Mehrere Oktaven Wertrauschen, Ergebnis in etwa [0, 1). */
export function fbm3(x: number, y: number, z: number, seed: number, octaves: number): number {
  let sum = 0;
  let amp = 1;
  let total = 0;
  let freq = 1;
  for (let i = 0; i < octaves; i++) {
    sum += amp * valueNoise3(x * freq, y * freq, z * freq, seed + i * 101);
    total += amp;
    amp *= 0.5;
    freq *= 2;
  }
  return sum / total;
}
