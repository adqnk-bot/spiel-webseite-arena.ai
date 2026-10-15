import { BlockType, type BlockId } from "./blocks";
import { hash3 } from "./noise";
import { surfaceHeight } from "./terrain";

/**
 * Strukturen liegen in Zellen von 64 Blöcken Breite und genau einer Ebene.
 *
 * Jede Struktur ist eine Schablone: ein Rechteck mit Blocktypen. Felder ohne Eintrag
 * bleiben Gelände. Luft-Einträge markieren Räume, die das Gelände ausschneiden.
 * Städte nehmen eine ganze Zelle ein. Alle anderen Strukturen teilen sich eine Zelle
 * in zwei Slots mit einem Block Abstand, sodass sich nichts überlappt.
 * Alles wird aus dem Seed berechnet, es muss nichts gespeichert werden.
 */
export const CELL_SIZE = 64;
const SLOT_SIZE = 32;
const EMPTY = 255;
const AIR = BlockType.Air;
const CONCRETE = BlockType.Concrete;
const METAL = BlockType.Metal;
const WOOD = BlockType.Wood;
const GLASS = BlockType.Glass;
const SCRAP = BlockType.Scrap;

export type ZoneKind = "wild" | "city" | "bunker" | "wreck" | "mine" | "tower";

export interface ZoneInfo {
  kind: ZoneKind;
  name: string;
  /** Vorgabe für Loot-Qualität (0 = normal, 2 = am besten). */
  lootTier: number;
  /** Vorgabe für Monster-Gefahr (1 = gering, 3 = hoch). */
  dangerLevel: number;
}

export const ZONE_INFO: Record<ZoneKind, ZoneInfo> = {
  wild: { kind: "wild", name: "Wildnis", lootTier: 0, dangerLevel: 1 },
  city: { kind: "city", name: "Verlassene Stadt", lootTier: 1, dangerLevel: 2 },
  bunker: { kind: "bunker", name: "Bunker", lootTier: 2, dangerLevel: 3 },
  wreck: { kind: "wreck", name: "Raumschiff-Wrack", lootTier: 2, dangerLevel: 3 },
  mine: { kind: "mine", name: "Verlassene Mine", lootTier: 1, dangerLevel: 2 },
  tower: { kind: "tower", name: "Antennenturm", lootTier: 1, dangerLevel: 2 },
};

/** Eine Struktur. Methoden arbeiten mit Welt-Koordinaten; Ebene und Seed sind eingeschlossen. */
export interface Structure {
  zone: ZoneKind;
  /** Begrenzung in x (inklusiv). Außerhalb davon wirkt die Struktur nicht. */
  x0: number;
  x1: number;
  /** Höhe, auf die das Gelände im x-Bereich eingeebnet wird. null = Gelände bleibt. */
  flatBase: number | null;
  /** Liegt die Position im Volumen der Struktur? */
  contains(x: number, y: number): boolean;
  /** Block der Struktur an dieser Position, oder null, wenn das natürliche Gelände gilt. */
  blockAt(x: number, y: number): BlockId | null;
}

// --- Schablone -----------------------------------------------------------

class Stamp {
  readonly x0: number;
  readonly y0: number;
  readonly x1: number;
  readonly y1: number;
  readonly w: number;
  readonly data: Uint8Array;

  constructor(x0: number, y0: number, x1: number, y1: number) {
    this.x0 = x0;
    this.y0 = y0;
    this.x1 = x1;
    this.y1 = y1;
    this.w = x1 - x0 + 1;
    this.data = new Uint8Array(this.w * (y1 - y0 + 1)).fill(EMPTY);
  }

  set(x: number, y: number, id: BlockId): void {
    if (x < this.x0 || x > this.x1 || y < this.y0 || y > this.y1) return;
    this.data[(y - this.y0) * this.w + (x - this.x0)] = id;
  }

  /** Rechteck inklusive Grenzen. */
  fill(xa: number, ya: number, xb: number, yb: number, id: BlockId): void {
    for (let y = ya; y <= yb; y++) for (let x = xa; x <= xb; x++) this.set(x, y, id);
  }

  get(x: number, y: number): number {
    if (x < this.x0 || x > this.x1 || y < this.y0 || y > this.y1) return EMPTY;
    return this.data[(y - this.y0) * this.w + (x - this.x0)];
  }

  build(zone: ZoneKind, flatBase: number | null): Structure {
    return {
      zone,
      x0: this.x0,
      x1: this.x1,
      flatBase,
      contains: (x, y) => this.get(x, y) !== EMPTY,
      blockAt: (x, y) => {
        const v = this.get(x, y);
        return v === EMPTY ? null : (v as BlockId);
      },
    };
  }
}

// --- Zufall --------------------------------------------------------------

function rnd(seed: number, a: number, b: number, z: number, salt: number): number {
  return hash3(a, b, z * 31 + salt, seed + salt * 7919);
}

const cellCache = new Map<string, Structure[]>();

// --- Stadt ---------------------------------------------------------------

type BuildingKind = "house" | "shop" | "tower" | "ruin";

/** Verlassene Stadt: Wohnhäuser, Läden, Hochhäuser und Ruinen an einer Straße mit Laternen. */
function makeCity(seed: number, z: number, x0: number, w: number): Structure {
  const x1 = x0 + w - 1;
  const B = surfaceHeight(seed, x0 + (w >> 1), z); // Straßenebene
  const H = 24;
  const st = new Stamp(x0, B - H, x1, B);
  st.fill(x0, B - H, x1, B - 1, AIR); // Luftraum der Stadt (gehört zur Zone)

  let x = x0 + 1;
  let n = 0;
  while (x + 4 < x1) {
    const bw = Math.min(5 + Math.floor(rnd(seed, x, 2, z, 62) * 6), x1 - x - 1);
    if (bw < 5) break;
    const r = rnd(seed, x, 1, z, 61);
    const kind: BuildingKind = r < 0.4 ? "house" : r < 0.6 ? "shop" : r < 0.8 ? "tower" : "ruin";
    drawBuilding(st, seed, z, x, bw, B, kind, n);
    n++;

    const gap = 3 + Math.floor(rnd(seed, x, 3, z, 63) * 3);
    const gx = x + bw + ((gap - 1) >> 1);
    if (gx <= x1 - 1) {
      // Laterne: Metallmast mit Glasleuchte
      st.fill(gx, B - 5, gx, B - 1, METAL);
      st.set(gx, B - 6, GLASS);
    }
    // Schutt auf der Straße
    for (let gxx = x + bw; gxx < x + bw + gap; gxx++) {
      if (rnd(seed, gxx, 4, z, 64) < 0.3) st.set(gxx, B - 1, SCRAP);
    }
    x += bw + gap;
  }
  return st.build("city", B);
}

function drawBuilding(
  st: Stamp,
  seed: number,
  z: number,
  bx: number,
  bw: number,
  B: number,
  kind: BuildingKind,
  n: number,
): void {
  const bx1 = bx + bw - 1;
  const hgt = kind === "tower" ? 16 + Math.floor(rnd(seed, bx, 5, z, 65) * 6)
    : kind === "shop" ? 4
    : kind === "ruin" ? 7 + Math.floor(rnd(seed, bx, 6, z, 66) * 5)
    : 6 + Math.floor(rnd(seed, bx, 7, z, 67) * 6);
  const top = B - hgt;

  // Außenwände und Dach
  st.fill(bx, top, bx, B - 1, CONCRETE);
  st.fill(bx1, top, bx1, B - 1, CONCRETE);
  st.fill(bx, top, bx1, top, kind === "shop" ? METAL : CONCRETE);

  // Geschossdecken alle 4 Zeilen, Fenster in den Außenwänden
  for (let y = top + 4; y < B; y += 4) {
    st.fill(bx, y, bx1, y, CONCRETE);
    if (kind !== "shop") {
      st.set(bx, y - 2, GLASS);
      st.set(bx1, y - 2, GLASS);
    }
  }
  if (kind === "shop") {
    // Schaufenster: breites Glasband über der Straße
    st.fill(bx + 1, B - 3, bx1 - 1, B - 2, GLASS);
  }

  // Lagerkisten in den Räumen
  for (let x = bx + 1; x < bx1; x++) {
    if (rnd(seed, x, n, z, 68) < 0.12) st.set(x, B - 1, WOOD);
  }

  if (kind === "ruin") {
    // Einsturz: Lücken in den Wänden, abgebrochene Dächer, fehlende Decken
    for (let y = top; y < B; y++) {
      if (rnd(seed, bx, y, z, 69) < 0.25) st.set(bx, y, AIR);
      if (rnd(seed, bx1, y, z, 70) < 0.25) st.set(bx1, y, AIR);
    }
    for (let x = bx; x <= bx1; x++) {
      const cut = Math.floor(rnd(seed, x, 8, z, 71) * 4);
      for (let y = top; y < top + cut; y++) st.set(x, y, AIR);
      if (rnd(seed, x, 9, z, 72) < 0.25) st.set(x, top + 4, AIR);
    }
    for (let x = bx; x <= bx1; x++) {
      if (rnd(seed, x, 10, z, 73) < 0.5) st.set(x, B - 1, SCRAP);
    }
  }
  if (kind === "tower") {
    // Antenne auf dem Dach
    const ax = bx + (bw >> 1);
    st.fill(ax, top - 4, ax, top - 1, METAL);
  }

  // Eingang: Tür in der linken Wand, unten
  st.fill(bx, B - 3, bx, B - 1, AIR);
}

// --- Bunker --------------------------------------------------------------

/** Unterirdischer Bunker: drei Etagen, Schacht mit Leiter, Luke an der Oberfläche. */
function makeBunker(seed: number, z: number, x0: number, w: number): Structure {
  const x1 = x0 + w - 1;
  const c = x0 + (w >> 1);
  const S = surfaceHeight(seed, c, z);
  const L = [S + 6, S + 14, S + 22, S + 30]; // Deckenschichten
  const st = new Stamp(x0, S - 5, x1, L[3]);

  // Luke an der Oberfläche
  st.fill(c - 1, S - 4, c + 2, S - 4, METAL);
  st.fill(c - 1, S - 3, c - 1, S - 1, METAL);
  st.fill(c + 2, S - 3, c + 2, S - 1, METAL);

  // Decken und Außenwände
  for (const y of L) st.fill(x0, y, x1, y, METAL);
  st.fill(x0, L[0], x0, L[3], METAL);
  st.fill(x1, L[0], x1, L[3], METAL);

  // Räume zwischen den Decken, mit Trennwänden und Durchgängen
  const p1 = x0 + Math.floor(w / 3);
  const p2 = x0 + Math.floor((2 * w) / 3);
  for (let i = 0; i < 3; i++) {
    const top = L[i] + 1;
    const bottom = L[i + 1] - 1;
    st.fill(x0 + 1, top, x1 - 1, bottom, AIR);
    st.fill(p1, top, p1, bottom, METAL);
    st.fill(p2, top, p2, bottom, METAL);
    st.fill(p1, top, p1, top + 2, AIR);
    st.fill(p2, top, p2, top + 2, AIR);
    // Deckenlampen
    for (let x = x0 + 3; x < x1 - 2; x += 6) {
      if (x !== p1 && x !== p2) st.set(x, top, GLASS);
    }
    // Lagerkisten am Boden
    if (rnd(seed, i, 1, z, 80) < 0.7) st.set(x0 + 2, bottom, WOOD);
    if (rnd(seed, i, 2, z, 81) < 0.7) st.set(x1 - 2, bottom, WOOD);
  }

  // Schacht von der Luke bis zur untersten Etage, mit Leiter
  for (let y = S - 3; y < L[3]; y++) {
    st.set(c, y, AIR);
    st.set(c + 1, y, AIR);
  }
  for (let i = 0; i < 3; i++) {
    st.fill(c, L[i], c + 1, L[i], AIR);
  }
  for (let y = S - 2; y < L[0]; y += 2) st.set(c, y, METAL);
  for (let i = 0; i < 3; i++) {
    for (let y = L[i] + 1; y < L[i + 1]; y += 2) st.set(c, y, METAL);
  }

  // Zerfall: vereinzelte Schrottstücke und Lücken in den Decken
  for (let i = 0; i < 4; i++) {
    for (let x = x0 + 1; x < x1; x++) {
      if (rnd(seed, x, i, z, 82) < 0.02) st.set(x, L[i], AIR);
    }
  }
  for (let x = x0 + 1; x < x1; x++) {
    if (rnd(seed, x, 9, z, 83) < 0.08) st.set(x, L[3] - 1, SCRAP);
  }
  return st.build("bunker", null);
}

// --- Raumschiff-Wrack -----------------------------------------------------

/** Halb verschüttetes Raumschiff: gekippte Hülle, Glaskuppel, Heckflossen und Luke. */
function makeWreck(seed: number, z: number, x0: number, w: number): Structure {
  const cx = x0 + (w - 1) / 2;
  const S = surfaceHeight(seed, Math.floor(cx), z);
  const cy = S - 3;
  const theta = (rnd(seed, x0, 11, z, 90) - 0.5) * 0.3;
  const a = (w - 1) / 2 + 0.5;
  const b = 6;
  const cos = Math.cos(theta);
  const sin = Math.sin(theta);
  const st = new Stamp(x0 - 1, Math.floor(cy - b - 4), x0 + w + 3, Math.ceil(cy + b + 3));

  for (let y = Math.floor(cy - b - 4); y <= Math.ceil(cy + b + 3); y++) {
    for (let x = x0 - 1; x <= x0 + w + 3; x++) {
      const dx = x - cx;
      const dy = y - cy;
      const u = dx * cos + dy * sin;
      const v = -dx * sin + dy * cos;
      const outer = (u / a) ** 2 + (v / b) ** 2 <= 1;
      const inner = (u / (a - 1.6)) ** 2 + (v / (b - 1.6)) ** 2 <= 1;
      if (outer && !inner) {
        // Hülle, mit Fensterband und Verschleiß
        if (Math.abs(v + 2.5) < 0.6 && x % 4 === 0) st.set(x, y, GLASS);
        else st.set(x, y, rnd(seed, x, y, z, 91) < 0.05 ? SCRAP : METAL);
      } else if (inner) {
        // Innenraum: Deck als Boden, sonst Luft
        if (v > 0.5 && v < 1.5) st.set(x, y, METAL);
        else st.set(x, y, AIR);
      }
      // Glaskuppel am vorderen Ende
      if (outer && u > a * 0.55 && v < -b * 0.4) st.set(x, y, GLASS);
    }
  }

  // Luke an der Unterseite, hinten
  for (let y = Math.floor(cy - 1); y <= Math.floor(cy + 4); y++) {
    for (let x = Math.floor(cx - a + 1); x <= Math.floor(cx - a + 3); x++) st.set(x, y, AIR);
  }

  // Heckflossen als Dreiecke über dem Rumpf
  const tail = x0 + w;
  for (let x = tail; x <= tail + 2; x++) {
    for (let y = Math.floor(cy - 6 + 2 * (x - tail)); y <= Math.floor(cy - 2); y++) st.set(x, y, METAL);
  }
  return st.build("wreck", null);
}

// --- Mine ----------------------------------------------------------------

/** Verlassene Mine: Fördergerüst, Schacht mit Holzrahmen, drei Stollen mit Schienen und Loren. */
function makeMine(seed: number, z: number, x0: number, w: number): Structure {
  const x1 = x0 + w - 1;
  const c = x0 + (w >> 1);
  const S = surfaceHeight(seed, c, z);
  const M = [S + 10, S + 19, S + 28]; // Oberkante der Stollen (3 hoch)
  const bottom = M[2] + 3;
  const st = new Stamp(x0, S - 8, x1, bottom);

  // Fördergerüst über dem Schacht
  st.fill(c - 2, S - 7, c - 2, S - 1, WOOD);
  st.fill(c + 3, S - 7, c + 3, S - 1, WOOD);
  st.fill(c - 2, S - 7, c + 3, S - 7, WOOD);
  st.fill(c, S - 8, c + 1, S - 8, METAL);

  // Schacht mit Holzrahmen
  for (let y = S - 6; y <= bottom; y++) {
    st.set(c, y, AIR);
    st.set(c + 1, y, AIR);
    if (y % 4 === 0) {
      st.set(c - 1, y, WOOD);
      st.set(c + 2, y, WOOD);
    }
  }

  // Stollen
  for (let i = 0; i < 3; i++) {
    const top = M[i];
    st.fill(x0 + 1, top, x1 - 1, top + 2, AIR);
    st.fill(x0 + 1, top + 3, x1 - 1, top + 3, METAL); // Schiene als Boden
    for (let x = x0 + 1; x < x1; x += 4) st.set(x, top - 1, WOOD); // Deckenbalken
    for (let x = c - 8; x <= c + 9; x++) {
      if (((x - c) % 8 + 8) % 8 === 4 && x !== c && x !== c + 1) {
        st.set(x, top, WOOD);
        st.set(x, top + 1, WOOD);
        st.set(x, top + 2, WOOD);
      }
    }
    // Lore auf der Schiene
    const lx = i === 1 ? x0 + 4 : x1 - 6;
    st.fill(lx, top + 2, lx + 1, top + 2, METAL);
    // Nebenschacht zur nächsten Etage
    if (i < 2) {
      for (let y = top + 3; y < M[i + 1]; y++) {
        st.set(x0 + 3, y, AIR);
        st.set(x0 + 4, y, AIR);
      }
    }
  }
  return st.build("mine", null);
}

// --- Antennenturm --------------------------------------------------------

/** Gittermast mit Plattform, Funkschüssel und kleiner Wachstube am Boden. */
function makeTower(seed: number, z: number, x0: number): Structure {
  const c = x0 + 2;
  const B = surfaceHeight(seed, c, z);
  const st = new Stamp(x0 - 1, B - 40, x0 + 5, B);
  const x1 = x0 + 4;

  // Wachstube am Boden
  st.fill(x0, B - 5, x1, B - 5, CONCRETE);
  st.fill(x0, B - 4, x0, B - 1, CONCRETE);
  st.fill(x1, B - 4, x1, B - 1, CONCRETE);
  st.fill(x0 + 1, B - 4, x0 + 3, B - 1, AIR);
  st.fill(x0, B - 3, x0, B - 1, AIR); // Tür
  st.set(x1, B - 3, GLASS);

  // Gitterbeine und Zickzack-Verstrebungen
  st.fill(x0, B - 30, x0, B - 6, METAL);
  st.fill(x1, B - 30, x1, B - 6, METAL);
  for (let y = B - 29; y <= B - 7; y++) {
    const col = x0 + [1, 2, 3, 2][((B - y) % 4 + 4) % 4];
    st.set(col, y, METAL);
  }
  for (let y = B - 30; y <= B - 6; y += 6) st.fill(x0, y, x1, y, METAL);

  // Plattform mit Geländer
  st.fill(x0 - 1, B - 22, x0 + 5, B - 22, METAL);
  st.fill(x0 - 1, B - 23, x0 + 5, B - 23, METAL);
  st.fill(x0 - 1, B - 23, x0 - 1, B - 22, METAL);
  st.fill(x0 + 5, B - 23, x0 + 5, B - 22, METAL);

  // Mast mit Funkschüssel und Leuchte
  st.fill(x0, B - 31, x1, B - 31, METAL);
  st.fill(c, B - 38, c, B - 32, METAL);
  st.fill(c - 2, B - 36, c + 2, B - 36, METAL);
  st.fill(c - 1, B - 37, c + 1, B - 37, METAL);
  st.set(c, B - 39, GLASS);

  return st.build("tower", B);
}

// --- Zellen ---------------------------------------------------------------

/** Strukturen einer Zelle (Spalte cx, Ebene z). Ergebnisse werden gecacht. */
export function getCell(seed: number, cx: number, z: number): Structure[] {
  const key = `${seed}|${cx}|${z}`;
  let list = cellCache.get(key);
  if (list) return list;

  list = [];
  const cellStart = cx * CELL_SIZE;
  if (rnd(seed, cx, 50, z, 5) < 0.2) {
    // Stadt belegt die ganze Zelle
    list.push(makeCity(seed, z, cellStart + 4, 56));
  } else {
    for (let slot = 0; slot < 2; slot++) {
      if (rnd(seed, cx, 20 + slot, z, 5) >= 0.8) continue; // Slot bleibt leer

      const slotStart = cellStart + slot * SLOT_SIZE + 1;
      const kind = rnd(seed, cx, 22 + slot, z, 5);
      const place = (width: number) =>
        slotStart + Math.floor(rnd(seed, cx, 30 + slot, z, 5) * (SLOT_SIZE - 3 - width));
      const width = (min: number, range: number) =>
        min + Math.floor(rnd(seed, cx, 40 + slot, z, 5) * range);

      if (kind < 0.35) {
        const w = width(22, 6);
        list.push(makeBunker(seed, z, place(w), w));
      } else if (kind < 0.6) {
        const w = width(22, 6);
        list.push(makeMine(seed, z, place(w), w));
      } else if (kind < 0.8) {
        const w = width(16, 4);
        list.push(makeWreck(seed, z, place(w + 3), w));
      } else {
        list.push(makeTower(seed, z, place(4)));
      }
    }
  }

  cellCache.set(key, list);
  if (cellCache.size > 4000) cellCache.clear();
  return list;
}

/** Zone an einer Position: die erste Struktur, die sie enthält, sonst Wildnis. */
export function zoneAt(seed: number, x: number, y: number, z: number): ZoneInfo {
  const structures = getCell(seed, Math.floor(x / CELL_SIZE), z);
  for (const s of structures) {
    if (x >= s.x0 && x <= s.x1 && s.contains(x, y)) return ZONE_INFO[s.zone];
  }
  return ZONE_INFO.wild;
}
