import { BlockType, type BlockId } from "./blocks";
import { CELL_SIZE, getCell, type Structure } from "./structures";
import { biomeAt, surfaceHeight, terrainBlock, type BiomeInfo } from "./terrain";

/**
 * Erzeugt den Ursprungszustand eines Blocks. Deterministisch aus Seed und Position.
 *
 * Die Berechnung läuft pro Spalte (x, z): Oberfläche, Biom und Strukturen einer Spalte
 * werden einmal bestimmt und gecacht. Ein Chunk braucht so pro Spalte nur eine Auswertung
 * und pro Block nur noch die Gelände- und Strukturabfrage.
 */

export interface Column {
  /** Oberfläche nach Einebnung durch Strukturen. */
  surface: number;
  biome: BiomeInfo;
  /** Strukturen, deren x-Bereich diese Spalte enthält. */
  structs: Structure[];
  /** Einebnungshöhe, falls eine Struktur das Gelände einebnet, sonst null. */
  flat: number | null;
}

const columnCache = new Map<string, Column>();

/** Spalte (x, z) mit Oberfläche, Biom und Strukturen. Gecacht. */
export function columnAt(seed: number, x: number, z: number): Column {
  const key = `${seed}|${x}|${z}`;
  const cached = columnCache.get(key);
  if (cached) return cached;

  const structs = getCell(seed, Math.floor(x / CELL_SIZE), z).filter((s) => x >= s.x0 && x <= s.x1);
  let flat: number | null = null;
  for (const s of structs) {
    if (s.flatBase !== null) {
      flat = s.flatBase;
      break;
    }
  }
  const column: Column = {
    surface: flat ?? surfaceHeight(seed, x, z),
    biome: biomeAt(seed, x, z),
    structs,
    flat,
  };
  if (columnCache.size > 200000) columnCache.clear();
  columnCache.set(key, column);
  return column;
}

/** Block an (x, y, z) innerhalb einer bekannten Spalte. */
export function blockInColumn(seed: number, column: Column, x: number, y: number, z: number): BlockId {
  for (const s of column.structs) {
    const b = s.blockAt(x, y);
    if (b !== null) return b;
  }
  if (column.flat !== null && y === column.flat) return BlockType.Concrete;
  return terrainBlock(seed, x, y, z, column.surface, column.biome);
}

export function generateBlock(seed: number, x: number, y: number, z: number): BlockId {
  return blockInColumn(seed, columnAt(seed, x, z), x, y, z);
}
