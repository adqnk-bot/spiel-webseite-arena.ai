/** Breite und Höhe eines Blocks in Welt-Pixeln (Pixel-Art-Maß). */
export const BLOCK_SIZE = 8;

/** Blocktypen. IDs bleiben stabil, weil sie später gespeichert werden. */
export const BlockType = {
  Air: 0,
  Dirt: 1,
  Stone: 2,
  Wood: 3,
  Ash: 4,
  Concrete: 5,
  Metal: 6,
  Glass: 7,
  Scrap: 8,
  Ice: 9,
  Crystal: 10,
  Slag: 11,
} as const;

export type BlockId = (typeof BlockType)[keyof typeof BlockType];

export const BLOCK_COLORS: Record<BlockId, string> = {
  [BlockType.Air]: "transparent",
  [BlockType.Dirt]: "#5c4a3a",
  [BlockType.Stone]: "#4d5057",
  [BlockType.Wood]: "#7a5a3a",
  [BlockType.Ash]: "#8c8580",
  [BlockType.Concrete]: "#a9a59d",
  [BlockType.Metal]: "#5f6b76",
  [BlockType.Glass]: "#7fb6bd",
  [BlockType.Scrap]: "#7b4b35",
  [BlockType.Ice]: "#b8e4f0",
  [BlockType.Crystal]: "#6fa8ff",
  [BlockType.Slag]: "#2b2222",
};
