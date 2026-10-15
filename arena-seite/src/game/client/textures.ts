import { BlockType, type BlockId } from "../../shared/blocks";
import { hash3 } from "../../shared/noise";

/**
 * Blockgrafiken: 32 × 32 Pixel pro Blocktyp. Jede Grafik wird prozedural aus Mustern erzeugt
 * (Mauerwerk, Dielen, Platten mit Nieten, Glasfenster, Kristallfacetten usw.).
 * Je Blocktyp gibt es drei Varianten; die Wahl und das Spiegeln hängen von der Position ab,
 * damit sich Muster nicht sichtbar wiederholen.
 */

export const TILE = 32;

type RGB = [number, number, number];

function hex(h: string): RGB {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function clamp(v: number): number {
  return v < 0 ? 0 : v > 255 ? 255 : Math.round(v);
}

/** Helligkeit multiplizieren. */
function scale(c: RGB, k: number): RGB {
  return [clamp(c[0] * k), clamp(c[1] * k), clamp(c[2] * k)];
}

function mix(a: RGB, b: RGB, t: number): RGB {
  return [clamp(a[0] + (b[0] - a[0]) * t), clamp(a[1] + (b[1] - a[1]) * t), clamp(a[2] + (b[2] - a[2]) * t)];
}

/** Zufallswert in [0, 1) für ein Pixel oder eine Zelle, je Variante und Musterart verschieden. */
function rnd(a: number, b: number, salt: number): number {
  return hash3(a, b, salt, 7331);
}

type Painter = (x: number, y: number, v: number) => RGB;

const WHITE: RGB = [240, 246, 250];

const PAINTERS: Record<number, Painter> = {
  // Erde: fleckige Erde mit hellen und dunklen Punkten und Kieseln
  [BlockType.Dirt]: (x, y, v) => {
    const base = hex("#5c4a3a");
    let k = 0.9 + rnd(x >> 2, y >> 2, 1 + v * 11) * 0.2;
    const r = rnd(x, y, 2 + v * 11);
    if (r < 0.08) k *= 0.78;
    else if (r > 0.93) k *= 1.22;
    if (rnd(x, y, 3 + v * 11) > 0.985) return hex("#7d7468");
    return scale(base, k);
  },

  // Gestein: unregelmäßiges Mauerwerk mit dunklen Fugen, Körnung und Rissen
  [BlockType.Stone]: (x, y, v) => {
    const base = hex("#4d5057");
    const row = Math.floor(y / 8);
    const bx = x + (row % 2) * 4;
    const cell = [Math.floor(bx / 8), row];
    let k = 0.84 + rnd(cell[0], cell[1], 20 + v * 11) * 0.3;
    if (bx % 8 === 0 || y % 8 === 0) k *= 0.6;
    k *= 0.95 + rnd(x, y, 21 + v * 11) * 0.1;
    // Riss: diagonal durch manche Zellen
    if (rnd(cell[0], cell[1], 22 + v * 11) < 0.25) {
      const cx = bx % 8;
      const cy = y % 8;
      if (cx === 2 + Math.floor(cy / 2) && cy > 1 && cy < 7) k *= 0.55;
    }
    return scale(base, k);
  },

  // Holz: Dielen mit Maserung, Astlöchern und Fugen
  [BlockType.Wood]: (x, y, v) => {
    const base = hex("#7a5a3a");
    const plank = Math.floor(x / 8);
    let k = 0.86 + rnd(plank, 0, 30 + v * 11) * 0.28;
    const gx = (x + Math.round(Math.sin(y * 0.3 + plank * 2) * 1.2) + 8) % 8;
    if (gx === 2) k *= 0.84;
    else if (gx === 5) k *= 1.06;
    if (x % 8 === 0) k *= 0.55;
    const knotY = Math.floor(rnd(plank, 1, 31 + v * 11) * 24) + 4;
    const kx = plank * 8 + 4;
    if (Math.hypot(x - kx, (y - knotY) * 1.4) < 1.6) k *= 0.5;
    if (y % 16 === 0) k *= 0.8;
    return scale(base, k);
  },

  // Asche: feines, staubiges Grau mit Flecken
  [BlockType.Ash]: (x, y, v) => {
    const base = hex("#8c8580");
    let k = 0.9 + rnd(x, y, 40 + v * 11) * 0.2;
    k *= 0.94 + rnd(x >> 3, y >> 3, 41 + v * 11) * 0.12;
    const r = rnd(x, y, 42 + v * 11);
    if (r < 0.04) return hex("#5f5a56");
    if (r > 0.97) return hex("#b5b0aa");
    return scale(base, k);
  },

  // Beton: Plattenraster mit Fugen, Rissen und Lunkern
  [BlockType.Concrete]: (x, y, v) => {
    const base = hex("#a9a59d");
    const px = Math.floor(x / 16);
    const py = Math.floor(y / 16);
    const lx = x % 16;
    const ly = y % 16;
    let k = 0.95 + rnd(px, py, 50 + v * 11) * 0.1;
    if (lx === 15 || ly === 15) k *= 0.8;
    else if (lx === 0 || ly === 0) k *= 1.05;
    if (rnd(x, y, 51 + v * 11) > 0.99) k *= 0.7;
    if (rnd(px, py, 52 + v * 11) < 0.35 && lx > 2 && lx < 14 && ly > 2 && ly < 14) {
      if (lx === 3 + Math.floor(ly / 3)) k *= 0.7;
    }
    return scale(base, k);
  },

  // Metall: Platten mit Facette, Nieten und Rostspuren
  [BlockType.Metal]: (x, y, v) => {
    const base = hex("#5f6b76");
    const lx = x % 16;
    const ly = y % 16;
    if (lx === 0 || ly === 0) return scale(base, 1.22);
    if (lx === 15 || ly === 15) return scale(base, 0.72);
    const rivet = [
      [3, 3],
      [12, 3],
      [3, 12],
      [12, 12],
    ];
    for (const [rx, ry] of rivet) {
      const d = Math.hypot(lx - rx, ly - ry);
      if (d < 0.9) return hex("#9aa6b2");
      if (d < 1.6) return scale(base, 0.6);
    }
    let k = 0.96 + rnd(Math.floor(x / 16), Math.floor(y / 16), 60 + v * 11) * 0.08;
    const streak = rnd(x, 0, 61 + v * 11) < 0.12 && rnd(x, y >> 3, 62 + v * 11) > 0.4;
    if (streak) return mix(scale(base, k), hex("#7a5030"), 0.35);
    return scale(base, k);
  },

  // Glas: helle Scheibe mit Rahmen, Diagonalreflexen und Staub
  [BlockType.Glass]: (x, y, v) => {
    const base = hex("#7fb6bd");
    if (x === 0 || y === 0 || x === 31 || y === 31) return hex("#4f8a92");
    if (x === 15 || x === 16 || y === 15 || y === 16) return scale(base, 0.8);
    const d = (x + y + v * 5) % 12;
    if (d === 2 || d === 3) return mix(base, WHITE, 0.45);
    if (d === 7) return mix(base, WHITE, 0.2);
    if (rnd(x, y, 70 + v * 11) > 0.975) return mix(base, WHITE, 0.6);
    return scale(base, 0.96 + rnd(x >> 2, y >> 2, 71 + v * 11) * 0.08);
  },

  // Schrott: Blech-Flicken in verschiedenen Farben mit dunklen Nähten
  [BlockType.Scrap]: (x, y, v) => {
    const cx = Math.floor(x / 8);
    const cy = Math.floor(y / 8);
    const pal = ["#8a5a3a", "#6e7680", "#3c4048", "#a88a3c", "#7b4b35"];
    const pick = Math.floor(rnd(cx, cy, 80 + v * 11) * pal.length);
    let c = hex(pal[pick]);
    const seam = x % 8 === 0 || y % 8 === 0;
    if (seam && rnd(cx, cy, 81 + v * 11) < 0.7) c = scale(c, 0.45);
    if (rnd(x, y, 82 + v * 11) > 0.97) return hex("#c8c8c8");
    return scale(c, 0.9 + rnd(x, y, 83 + v * 11) * 0.2);
  },

  // Eis: helle Facetten mit Glanzpunkten
  [BlockType.Ice]: (x, y, v) => {
    const base = hex("#b8e4f0");
    const a = (x + y + v * 3) % 11;
    const b = (x - y + 64 + v * 5) % 13;
    let k = 1;
    if (a < 5) k *= 1.06;
    if (b < 6) k *= 0.92;
    if (a === 0 || b === 0) k *= 0.85;
    if (rnd(x, y, 90 + v * 11) > 0.985) return WHITE;
    return scale(base, k * (0.97 + rnd(x >> 2, y >> 2, 91 + v * 11) * 0.06));
  },

  // Kristall: Diamantfacetten in Blautönen
  [BlockType.Crystal]: (x, y, v) => {
    const base = hex("#6fa8ff");
    const u = (x + y + v * 2) % 8;
    const w = (x - y + 64 + v * 3) % 8;
    let k = 1;
    if (u < 4 && w < 4) k = 1.2;
    else if (u >= 4 && w < 4) k = 0.9;
    else if (u < 4 && w >= 4) k = 1.05;
    else k = 0.78;
    if (u === 0 || w === 0) return scale(base, 0.6);
    if (rnd(x, y, 100 + v * 11) > 0.985) return WHITE;
    return scale(base, k);
  },

  // Schlacke: dunkle Kruste mit glühenden Adern
  [BlockType.Slag]: (x, y, v) => {
    const dark = hex("#2b2222");
    const t = Math.sin(x * 0.4 + Math.sin(y * 0.3) * 2 + v * 1.7);
    const a = Math.abs(t);
    if (a < 0.07) return mix(hex("#ff7a2a"), hex("#ffb35a"), rnd(x, y, 110 + v * 11) * 0.5);
    if (a < 0.18) return mix(dark, hex("#7a3320"), 0.7);
    return scale(dark, 0.85 + rnd(x >> 1, y >> 1, 111 + v * 11) * 0.3);
  },
};

export const VARIANTS = 3;

/** Pixel einer Grafik als RGBA, Breite und Höhe 32. */
export function renderTile(id: BlockId, variant = 0, mirror = false): Uint8ClampedArray<ArrayBuffer> | null {
  const painter = PAINTERS[id];
  if (!painter) return null;
  const out = new Uint8ClampedArray(new ArrayBuffer(TILE * TILE * 4));
  for (let y = 0; y < TILE; y++) {
    for (let x = 0; x < TILE; x++) {
      const sx = mirror ? TILE - 1 - x : x;
      const c = painter(sx, y, variant % VARIANTS);
      const o = (y * TILE + x) * 4;
      out[o] = c[0];
      out[o + 1] = c[1];
      out[o + 2] = c[2];
      out[o + 3] = 255;
    }
  }
  return out;
}

const tileCache = new Map<string, HTMLCanvasElement | null>();

/** Canvas für einen Blocktyp in einer Variante. null für Luft. */
export function tileFor(id: BlockId, mirror: boolean, variant = 0): HTMLCanvasElement | null {
  const key = `${id}|${mirror ? 1 : 0}|${variant}`;
  const cached = tileCache.get(key);
  if (cached !== undefined) return cached;
  const pixels = renderTile(id, variant, mirror);
  if (!pixels) {
    tileCache.set(key, null);
    return null;
  }
  const canvas = document.createElement("canvas");
  canvas.width = TILE;
  canvas.height = TILE;
  const ctx = canvas.getContext("2d");
  if (ctx) ctx.putImageData(new ImageData(pixels, TILE, TILE), 0, 0);
  tileCache.set(key, canvas);
  return canvas;
}

/** Spiegelung eines Blocks anhand seiner Position (verhindert sichtbare Muster). */
export function mirrorAt(x: number, y: number): boolean {
  return hash3(x, y, 1, 4242) < 0.5;
}

/** Variante eines Blocks anhand seiner Position. */
export function variantAt(x: number, y: number): number {
  return Math.floor(hash3(x, y, 2, 4242) * VARIANTS);
}

/** Canvas für den Block an Position (x, y), mit Variante und Spiegelung aus der Position. */
export function tileAt(id: BlockId, x: number, y: number): HTMLCanvasElement | null {
  return tileFor(id, mirrorAt(x, y), variantAt(x, y));
}
