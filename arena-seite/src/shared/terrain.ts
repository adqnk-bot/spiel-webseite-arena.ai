import { BlockType, type BlockId } from "./blocks";
import { fbm3, hash3, valueNoise3 } from "./noise";

/**
 * Gelände der Welt. Alles ist deterministisch aus dem Seed berechnet.
 *
 * y wächst nach unten. Die Oberfläche liegt um BASE_SURFACE herum. Darunter folgen
 * Gesteinsschichten mit Erzadern, Höhlen mit eigenen Höhlenbiomen und ab SLAG_Y die Schlackezone.
 */

/** Ab dieser absoluten Tiefe (y) wird der Untergrund zu Schlacke. */
export const SLAG_Y = 56;
/** Mittlere Höhe der Oberfläche. */
export const BASE_SURFACE = 26;

export type BiomeKind = "ash" | "glass" | "scrap" | "frost";

export interface BiomeInfo {
  kind: BiomeKind;
  name: string;
  /** Oberste Blockschicht. */
  top: BlockId;
  /** Schicht direkt darunter (bis Tiefe 3). */
  sub: BlockId;
}

export const BIOMES: Record<BiomeKind, BiomeInfo> = {
  ash: { kind: "ash", name: "Aschewüste", top: BlockType.Ash, sub: BlockType.Dirt },
  glass: { kind: "glass", name: "Glaskrater", top: BlockType.Glass, sub: BlockType.Stone },
  scrap: { kind: "scrap", name: "Schrottfeld", top: BlockType.Scrap, sub: BlockType.Dirt },
  frost: { kind: "frost", name: "Frostebene", top: BlockType.Ice, sub: BlockType.Stone },
};

const BIOME_ORDER: BiomeKind[] = ["ash", "glass", "scrap", "frost"];

export type CaveKind = "stone" | "crystal" | "ice" | "slag";

export interface CaveInfo {
  kind: CaveKind;
  name: string;
  /** Material der Höhlenwand. */
  wall: BlockId;
  /** Material für Ausschmückungen an der Wand (Kristall, Eis, Schlacke). */
  deco: BlockId;
  /** Anteil der Wandblöcke, die Ausschmückung tragen. */
  decoChance: number;
}

export const CAVES: Record<CaveKind, CaveInfo> = {
  stone: { kind: "stone", name: "Steinhöhle", wall: BlockType.Stone, deco: BlockType.Crystal, decoChance: 0.03 },
  crystal: { kind: "crystal", name: "Kristallhöhle", wall: BlockType.Stone, deco: BlockType.Crystal, decoChance: 0.4 },
  ice: { kind: "ice", name: "Eishöhle", wall: BlockType.Ice, deco: BlockType.Ice, decoChance: 0.25 },
  slag: { kind: "slag", name: "Schlackehöhle", wall: BlockType.Slag, deco: BlockType.Slag, decoChance: 0.2 },
};

const REGION_CELL = 96;
const CRATER_CELL = 72;
const HEAP_CELL = 40;

/** Biom an einer Spalte (x, z). Voronoi-Regionen mit zufälligen Punkten, Übergänge sind Grenzlinien. */
export function biomeAt(seed: number, x: number, z: number): BiomeInfo {
  const cx = Math.floor(x / REGION_CELL);
  const cz = Math.floor(z / REGION_CELL);
  let best = Infinity;
  let pick = 0;
  for (let dz = -1; dz <= 1; dz++) {
    for (let dx = -1; dx <= 1; dx++) {
      const ix = cx + dx;
      const iz = cz + dz;
      const px = (ix + hash3(ix, 0, iz, seed + 200)) * REGION_CELL;
      const pz = (iz + hash3(ix, 1, iz, seed + 201)) * REGION_CELL;
      const d = (x - px) * (x - px) + (z - pz) * (z - pz);
      if (d < best) {
        best = d;
        pick = Math.floor(hash3(ix, 2, iz, seed + 202) * BIOME_ORDER.length);
      }
    }
  }
  return BIOMES[BIOME_ORDER[pick]];
}

/** Kraterbeitrag (Glaskrater): Mulde mit erhöhtem Rand. Negativ = tiefer. */
function craterOffset(seed: number, x: number, z: number): number {
  const cx = Math.floor(x / CRATER_CELL);
  const cz = Math.floor(z / CRATER_CELL);
  let off = 0;
  for (let dz = -1; dz <= 1; dz++) {
    for (let dx = -1; dx <= 1; dx++) {
      const ix = cx + dx;
      const iz = cz + dz;
      if (hash3(ix, 3, iz, seed + 210) > 0.6) continue;
      const px = (ix + 0.2 + hash3(ix, 4, iz, seed + 211) * 0.6) * CRATER_CELL;
      const pz = (iz + 0.2 + hash3(ix, 5, iz, seed + 212) * 0.6) * CRATER_CELL;
      const r = 7 + Math.floor(hash3(ix, 6, iz, seed + 213) * 7);
      const depth = 5 + hash3(ix, 7, iz, seed + 214) * 4;
      const d = Math.hypot(x - px, z - pz) / r;
      if (d < 1) off -= depth * (1 - d * d);
      else if (d < 1.3) off += ((1.3 - d) / 0.3) * 2.5;
    }
  }
  return off;
}

/** Schutthaufen (Schrottfeld): Kegel, die aus dem Gelände ragen. */
function heapOffset(seed: number, x: number, z: number): number {
  const cx = Math.floor(x / HEAP_CELL);
  const cz = Math.floor(z / HEAP_CELL);
  let off = 0;
  for (let dz = -1; dz <= 1; dz++) {
    for (let dx = -1; dx <= 1; dx++) {
      const ix = cx + dx;
      const iz = cz + dz;
      if (hash3(ix, 8, iz, seed + 220) > 0.45) continue;
      const px = (ix + 0.2 + hash3(ix, 9, iz, seed + 221) * 0.6) * HEAP_CELL;
      const pz = (iz + 0.2 + hash3(ix, 10, iz, seed + 222) * 0.6) * HEAP_CELL;
      const r = 4 + hash3(ix, 11, iz, seed + 223) * 4;
      const height = 4 + hash3(ix, 12, iz, seed + 224) * 4;
      const d = Math.hypot(x - px, z - pz) / r;
      if (d < 1) off -= height * (1 - d);
    }
  }
  return off;
}

const surfaceCache = new Map<string, number>();

/**
 * Oberflächenhöhe (y) für eine Spalte (x, z). Jede Ebene (z) hat eine eigene Oberfläche.
 * Die Form hängt vom Biom ab: Dünen, Krater, Schutthaufen, Terrassen.
 */
export function surfaceHeight(seed: number, x: number, z: number): number {
  const key = `${seed}|${x}|${z}`;
  const cached = surfaceCache.get(key);
  if (cached !== undefined) return cached;

  // Domain-Warping: die Koordinaten für die Grundform werden leicht verzerrt.
  const wx = x + (fbm3(x * 0.02, 0, z * 0.02, seed + 31, 2) - 0.5) * 18;
  const wz = z + (fbm3(x * 0.02, 1, z * 0.02, seed + 32, 2) - 0.5) * 18;

  let h = BASE_SURFACE;
  h += (fbm3(wx * 0.012, 0, wz * 0.012, seed + 11, 3) - 0.5) * 18;
  h += (fbm3(x * 0.05, 0.5, z * 0.05, seed + 12, 2) - 0.5) * 4;
  // Versatz je Ebene: die Ebenen unterscheiden sich sichtbar, bleiben aber zusammenhängend.
  h += (fbm3(x * 0.02, 0, z * 0.15, seed + 13, 2) - 0.5) * 6;

  switch (biomeAt(seed, x, z).kind) {
    case "ash": {
      // Dünen: Wellen mit verschobener Phase.
      const phase = fbm3(x * 0.04, 0, z * 0.04, seed + 14, 2) * 4;
      h += Math.sin(x * 0.19 + phase) * 2.2 + (valueNoise3(x * 0.1, 0, z * 0.1, seed + 15) - 0.5) * 1.5;
      break;
    }
    case "glass":
      h += craterOffset(seed, x, z);
      break;
    case "scrap":
      h += heapOffset(seed, x, z) + (valueNoise3(x * 0.15, 0, z * 0.15, seed + 16) - 0.5) * 2;
      break;
    case "frost": {
      // Terrassen: Stufen von 3 Blöcken.
      h = Math.round(h / 3) * 3 + (valueNoise3(x * 0.3, 0, z * 0.3, seed + 17) - 0.5);
      break;
    }
  }

  const result = Math.round(h);
  if (surfaceCache.size > 150000) surfaceCache.clear();
  surfaceCache.set(key, result);
  return result;
}

/** Kristallregion: große Bereiche im Untergrund, in denen Kristalladern häufiger sind. */
export function isCrystalRegion(seed: number, x: number, y: number, z: number): boolean {
  return fbm3(x * 0.02, y * 0.02, z * 0.02, seed + 900, 2) > 0.6;
}

/** Höhlenbiom an einer Stelle. Ab SLAG_Y sind alle Höhlen Schlackehöhlen. */
export function caveKindAt(seed: number, x: number, y: number, z: number, biome: BiomeInfo): CaveKind {
  if (y >= SLAG_Y - 8) return "slag";
  const n = fbm3(x * 0.012, 0, z * 0.012, seed + 1300, 2);
  if (n < 0.3) return "crystal";
  if (n < 0.6) return "stone";
  return biome.kind === "frost" ? "ice" : "stone";
}

/** Höhlen: Hohlräume im Untergrund aus zwei Rauschfeldern (Gänge und Kammern). */
export function isCave(seed: number, x: number, y: number, z: number, surface: number): boolean {
  if (y <= surface + 3) return false;
  const tunnel = fbm3(x * 0.07, y * 0.1, z * 0.07, seed + 101, 2);
  if (tunnel > 0.7) return true;
  return fbm3(x * 0.025, y * 0.03, z * 0.025, seed + 102, 2) > 0.76;
}

/** Ob (x, y, z) ein Höhlenblock ist, der die Wand einer Höhle bildet (Luft darüber). */
function caveWall(seed: number, x: number, y: number, z: number, biome: BiomeInfo, cave: CaveInfo): BlockId {
  const roll = hash3(x, y, z, seed + 1400);
  if (roll < cave.decoChance) return cave.deco;
  return cave.wall;
}

/** Gesteinsblock im Untergrund, ohne Höhle. */
function undergroundBlock(seed: number, x: number, y: number, z: number, surface: number, biome: BiomeInfo): BlockId {
  if (y >= SLAG_Y) return BlockType.Slag;
  const depth = y - surface;
  if (depth < 4) return biome.sub;

  // Schichtung: Bänder aus Erde und Stein, mit weich verformten Grenzen.
  const warp = (valueNoise3(x * 0.04, y * 0.04, z * 0.04, seed + 500) - 0.5) * 6;
  const band = Math.floor((y + warp) / 7);
  let base: BlockId = band & 1 ? BlockType.Stone : BlockType.Dirt;
  if (biome.kind === "frost") base = BlockType.Stone;

  // Erzadern: dünne Schalen im Rauschfeld. Metall ist der seltene Erzblock.
  const vein = valueNoise3(x * 0.09, y * 0.09, z * 0.09, seed + 600);
  if (Math.abs(vein - 0.5) < 0.003 && depth > 6) return BlockType.Metal;

  // Schrottnester
  if (valueNoise3(x * 0.18, y * 0.18, z * 0.18, seed + 650) > 0.86) return BlockType.Scrap;

  // Kristallnester, in Kristallregionen häufiger.
  const crystalLimit = isCrystalRegion(seed, x, y, z) ? 0.66 : 0.84;
  if (valueNoise3(x * 0.15, y * 0.15, z * 0.15, seed + 700) > crystalLimit) return BlockType.Crystal;

  // Eisadern im Frost-Untergrund
  if (biome.kind === "frost" && valueNoise3(x * 0.12, y * 0.12, z * 0.12, seed + 800) > 0.62) {
    return BlockType.Ice;
  }
  return base;
}

/**
 * Block des Geländes an (x, y, z) ohne Strukturen. `surface` ist die Oberfläche der Spalte
 * (kann durch eine Struktur eingeebnet sein), `biome` das Biom der Spalte.
 */
export function terrainBlock(
  seed: number,
  x: number,
  y: number,
  z: number,
  surface: number,
  biome: BiomeInfo,
): BlockId {
  if (y < surface) return BlockType.Air;
  if (y === surface) return biome.top;

  if (isCave(seed, x, y, z, surface)) return BlockType.Air;

  // Wand einer Höhle: der Block liegt direkt unter einem Hohlraum.
  if (isCave(seed, x, y - 1, z, surface)) {
    const cave = CAVES[caveKindAt(seed, x, y, z, biome)];
    return caveWall(seed, x, y, z, biome, cave);
  }

  return undergroundBlock(seed, x, y, z, surface, biome);
}

/** Name der Region an einer Position: Höhlenbiom im Untergrund, sonst Oberflächenbiom. */
export function regionName(seed: number, x: number, y: number, z: number): string {
  const biome = biomeAt(seed, x, z);
  const surface = surfaceHeight(seed, x, z);
  if (isCave(seed, x, y, z, surface)) return CAVES[caveKindAt(seed, x, y, z, biome)].name;
  if (y > surface) return "Untergrund";
  return biome.name;
}
