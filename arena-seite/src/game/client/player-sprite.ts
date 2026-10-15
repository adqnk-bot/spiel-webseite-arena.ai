import { BLOCK_SIZE } from "../../shared/blocks";

/**
 * Spielerfigur: 8 Pixel breit, 14 Pixel hoch. Der Kopf ist 8 × 8 Pixel.
 * Die Figur besteht aus Teilen (Kopf, Torso, Arme, Beine, Hüften). Jedes Teil kann
 * für Animationen verschoben werden. Die Pixel selbst kann der Spieler im Editor ändern.
 */
export const SPRITE_W = 8;
export const SPRITE_H = 14;

/** Größe des Spielers in Blöcken (für die Physik). */
export const PLAYER_W_BLOCKS = SPRITE_W / BLOCK_SIZE;
export const PLAYER_H_BLOCKS = SPRITE_H / BLOCK_SIZE;

/** Ein Pixel pro Index: y * SPRITE_W + x. null = transparent. */
export type Grid = (string | null)[];

export const PALETTE: Record<string, string> = {
  o: "#2d3440", // Umriss
  w: "#e8ecf1", // Raumanzug
  g: "#aeb8c4", // Raumanzug, Schatten
  H: "#ffffff", // Helm, Lichtkante
  v: "#1d3f57", // Visier
  V: "#7fd0e6", // Visier-Glanz
  a: "#f08a3c", // Akzent (Brustlicht und Gürtel)
  k: "#4b5563", // Handschuhe und Stiefel
};

/**
 * Vorlage: Astronaut, 8 × 14 Pixel.
 * Zeilen 0–7: Helm mit Visier nach rechts (Blickrichtung), Licht von links oben.
 * Zeilen 8–10: Schultern, Arme mit Handschuhen, Brust mit Akzentlicht.
 * Zeilen 11–13: Beine und Stiefel.
 */
const TEMPLATE_ROWS = [
  "..oooo..",
  ".oHwwwgo",
  "owvvvvgo",
  "owvVvvgo",
  "owvvvvgo",
  "owwwwggo",
  ".oggggo.",
  "..oooo..",
  "ogwwwwgo",
  "gwwaawwg",
  "kwwwwwwk",
  "..wwww..",
  "..wggw..",
  ".kkkkkk.",
];

export function templateGrid(): Grid {
  if (TEMPLATE_ROWS.length !== SPRITE_H) throw new Error("Vorlage hat falsche Höhe");
  const grid: Grid = [];
  for (const row of TEMPLATE_ROWS) {
    if (row.length !== SPRITE_W) throw new Error(`Vorlagenzeile "${row}" hat falsche Breite`);
    for (const ch of row) grid.push(ch === "." ? null : PALETTE[ch]);
  }
  return grid;
}

/** Rechteck in Sprite-Pixeln, Grenzen inklusive. */
interface Rect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export const PARTS = {
  head: { x0: 0, y0: 0, x1: 7, y1: 7 },
  torso: { x0: 2, y0: 8, x1: 5, y1: 10 },
  armL: { x0: 0, y0: 8, x1: 1, y1: 10 },
  armR: { x0: 6, y0: 8, x1: 7, y1: 10 },
  legL: { x0: 2, y0: 11, x1: 3, y1: 13 },
  legR: { x0: 4, y0: 11, x1: 5, y1: 13 },
  hipL: { x0: 0, y0: 11, x1: 1, y1: 13 },
  hipR: { x0: 6, y0: 11, x1: 7, y1: 13 },
} satisfies Record<string, Rect>;

export type PartName = keyof typeof PARTS;
const PART_NAMES = Object.keys(PARTS) as PartName[];

/** Verschiebung eines Teils in Pixeln: [dx, dy]. */
export type Offset = [number, number];
export type Pose = Partial<Record<PartName, Offset>>;

function allParts(dx: number, dy: number): Pose {
  const pose: Pose = {};
  for (const name of PART_NAMES) pose[name] = [dx, dy];
  return pose;
}

// --- Posen ----------------------------------------------------------------

const STAND: Pose = {};
const BOB: Pose = allParts(0, -1);
const WALK_RIGHT_LEG_UP: Pose = { legR: [0, -1] };
const WALK_LEFT_LEG_UP: Pose = { legL: [0, -1] };
const JUMP: Pose = { armL: [0, -2], armR: [0, -2], legL: [0, -1], legR: [0, -1] };
const FALL: Pose = { armL: [0, -1], armR: [0, -1], legL: [-1, 0], legR: [1, 0] };

export type AnimState = "idle" | "walk" | "jump" | "fall";

/**
 * Pose für einen Zustand. `time` ist die Zeit in Sekunden seit Beginn des Zustands.
 * Stehen atmet langsam, Laufen hat vier Frames.
 */
export function poseFor(state: AnimState, time: number): Pose {
  switch (state) {
    case "idle":
      return Math.floor(time / 0.5) % 2 === 1 ? BOB : STAND;
    case "walk": {
      const frames = [WALK_RIGHT_LEG_UP, STAND, WALK_LEFT_LEG_UP, STAND];
      return frames[Math.floor(time / 0.1) % frames.length];
    }
    case "jump":
      return JUMP;
    case "fall":
      return FALL;
  }
}

// --- Zeichnen -------------------------------------------------------------

let offscreen: CanvasRenderingContext2D | null = null;
function offscreenCtx(): CanvasRenderingContext2D {
  if (!offscreen) {
    const canvas = document.createElement("canvas");
    canvas.width = SPRITE_W;
    canvas.height = SPRITE_H;
    offscreen = canvas.getContext("2d");
    if (!offscreen) throw new Error("Canvas 2D wird nicht unterstützt");
  }
  return offscreen;
}

/**
 * Zeichnet die Figur mit einer Pose. `px`/`py` ist die linke obere Ecke auf dem Bildschirm,
 * `scale` die Bildschirmpixel pro Sprite-Pixel. `flip` spiegelt horizontal (Blickrichtung).
 */
export function drawPlayer(
  ctx: CanvasRenderingContext2D,
  grid: Grid,
  pose: Pose,
  px: number,
  py: number,
  scale: number,
  flip: boolean,
): void {
  const off = offscreenCtx();
  off.clearRect(0, 0, SPRITE_W, SPRITE_H);
  for (const name of PART_NAMES) {
    const r = PARTS[name];
    const [dx, dy] = pose[name] ?? [0, 0];
    for (let y = r.y0; y <= r.y1; y++) {
      for (let x = r.x0; x <= r.x1; x++) {
        const color = grid[y * SPRITE_W + x];
        if (!color) continue;
        const tx = x + dx;
        const ty = y + dy;
        if (tx < 0 || ty < 0 || tx >= SPRITE_W || ty >= SPRITE_H) continue;
        off.fillStyle = color;
        off.fillRect(tx, ty, 1, 1);
      }
    }
  }

  const w = SPRITE_W * scale;
  const h = SPRITE_H * scale;
  ctx.save();
  if (flip) {
    ctx.translate(px + w, py);
    ctx.scale(-1, 1);
    ctx.drawImage(off.canvas, 0, 0, w, h);
  } else {
    ctx.drawImage(off.canvas, px, py, w, h);
  }
  ctx.restore();
}

// --- Speicherung ----------------------------------------------------------

const STORAGE_KEY = "spiel.player.sprite.v3"; // v3: überarbeiteter Astronaut

/** Lädt die gespeicherte Figur aus dem Browser. Ohne gültige Daten gilt die Vorlage. */
export function loadGrid(): Grid {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed: unknown = JSON.parse(raw);
      if (
        Array.isArray(parsed) &&
        parsed.length === SPRITE_W * SPRITE_H &&
        parsed.every((v) => v === null || typeof v === "string")
      ) {
        return parsed as Grid;
      }
    }
  } catch {
    // Ungültige Daten: Vorlage verwenden.
  }
  return templateGrid();
}

export function saveGrid(grid: Grid): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(grid));
}
