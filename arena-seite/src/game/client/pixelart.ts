import type { MonsterKind } from "../../shared/monsters";
import type { WeaponId } from "../../shared/items";

/**
 * Kleine Pixel-Grafiken. Jede Zeile ist ein String, jedes Zeichen ein Pixel.
 * `.` ist durchsichtig, alle anderen Zeichen stehen für eine Farbe in `palette`.
 */
export interface Art {
  rows: string[];
  palette: Record<string, string>;
  width: number;
  height: number;
}

function art(rows: string[], palette: Record<string, string>): Art {
  const width = rows[0].length;
  for (const row of rows) {
    if (row.length !== width) throw new Error(`Pixelzeile "${row}" hat falsche Breite`);
  }
  return { rows, palette, width, height: rows.length };
}

/** Zeichnet eine Grafik mit linker oberer Ecke bei (x, y) in Bildschirmpixeln. */
export function drawArt(
  c: CanvasRenderingContext2D,
  a: Art,
  x: number,
  y: number,
  scale: number,
  flip = false,
  alpha = 1,
): void {
  c.save();
  c.globalAlpha *= alpha;
  for (let row = 0; row < a.height; row++) {
    const line = a.rows[row];
    for (let col = 0; col < a.width; col++) {
      const ch = line[col];
      if (ch === ".") continue;
      const color = a.palette[ch];
      if (!color) continue;
      const cx = flip ? a.width - 1 - col : col;
      c.fillStyle = color;
      c.fillRect(x + cx * scale, y + row * scale, scale, scale);
    }
  }
  c.restore();
}

// --- Monster --------------------------------------------------------------

/** Kriecher: flacher Körper mit vier Beinen, 8 × 6 Pixel (0,75 Blöcke hoch). */
const CRAWLER = art(
  [
    "..oooo..",
    ".osssso.",
    "osesseso",
    "osssssso",
    "oddddddo",
    "o.o..o.o",
  ],
  { o: "#1f2a1c", s: "#6f9a3e", d: "#4a6b2a", e: "#ffe066" },
);

/** Späher: schwebende Kugel mit Flügeln, 8 × 8 Pixel. */
const DRONE = art(
  [
    "...oo...",
    "..occo..",
    "WwoccowW",
    "WwoeeowW",
    ".oCCCCo.",
    "..oCCo..",
    "..o..o..",
    "........",
  ],
  { o: "#1d2b3a", c: "#3ddbd9", C: "#1e7f86", e: "#ff4d6d", w: "#cfd8dc", W: "#8fa1ad" },
);

/** Wache: gepanzerter Riese, 8 × 16 Pixel (zwei Blöcke hoch). */
const BRUTE = art(
  [
    "..oooo..",
    ".oHHMMo.",
    "oMrMMrMo",
    "oMMMMMMo",
    ".oMmmmMo",
    "oomMMmoo",
    "omMMMMmo",
    "ouMMMMuo",
    ".omMMmo.",
    ".omMMmo.",
    "o.mmmm.o",
    "o.mm.mmo",
    "o.mm.mmo",
    "oo.mm.oo",
    "ooo..ooo",
    "........",
  ],
  { o: "#1b1f27", m: "#4b5160", M: "#7d8594", H: "#a3acba", r: "#ff4d4d", u: "#7a4a2a" },
);

export const MONSTER_ART: Record<MonsterKind, Art> = {
  crawler: CRAWLER,
  drone: DRONE,
  brute: BRUTE,
};

// --- Waffen und Gegenstände ----------------------------------------------

const DAGGER = art(
  [
    "......Bo",
    ".....bBo",
    "....bBo.",
    "...bBo..",
    "..gg....",
    ".hh.....",
    "hh......",
    "h.......",
  ],
  { o: "#2d3440", b: "#dfe6ee", B: "#9aa6b5", h: "#7b4b35", g: "#e0b040" },
);

const SWORD = art(
  [
    ".......o",
    "......bo",
    ".....bBo",
    "....bBo.",
    "...bBo..",
    ".gggo...",
    "..h.....",
    ".h......",
  ],
  { o: "#2d3440", b: "#dfe6ee", B: "#9aa6b5", h: "#7b4b35", g: "#e0b040" },
);

const BOW = art(
  [
    "..ooo...",
    ".owo.s..",
    "owo..s..",
    "ow...s..",
    "ow...s..",
    "owo..s..",
    ".owo.s..",
    "..ooo...",
  ],
  { o: "#2d3440", w: "#a8743f", s: "#e8e8e8" },
);

const CROSSBOW = art(
  [
    "........",
    "m......m",
    "ms....sm",
    "..s..s..",
    "...ss...",
    "..uuuu..",
    ".uUuuu..",
    "uu......",
  ],
  { m: "#aeb8c4", s: "#e8e8e8", u: "#7a4a2a", U: "#a8743f" },
);

export const WEAPON_ART: Record<WeaponId, Art> = {
  dagger: DAGGER,
  sword: SWORD,
  bow: BOW,
  crossbow: CROSSBOW,
};

/** Herz für die Lebensanzeige, 7 × 6 Pixel. */
export const HEART_ART = art(
  [
    ".oo.oo.",
    "oRRoRRo",
    "oRRRRRo",
    ".oRRRo.",
    "..oRo..",
    "...o...",
  ],
  { o: "#2d3440", R: "#e5484d" },
);
