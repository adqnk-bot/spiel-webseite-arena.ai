import { BlockType, type BlockId } from "./blocks";
import { blockInColumn, columnAt } from "./generator";

/**
 * Welt-Zugriff. Koordinaten sind ganzzahlige Blockpositionen:
 * x nach rechts, y nach unten, z = Ebene (Tiefe).
 */
export interface World {
  getBlock(x: number, y: number, z: number): BlockId;
  setBlock(x: number, y: number, z: number, id: BlockId): void;
}

/** Kantenlänge eines Chunks in Blöcken. Chunks sind Würfel. */
export const CHUNK_SIZE = 16;

/**
 * Unendliche Welt aus Chunks. Ein Chunk wird beim ersten Zugriff aus dem Seed erzeugt.
 * Nur der Chunk-Speicher wird gehalten. Geänderte Blöcke landen im Chunk.
 */
export class ChunkWorld implements World {
  private readonly chunks = new Map<string, Uint8Array>();

  constructor(readonly seed: number) {}

  getBlock(x: number, y: number, z: number): BlockId {
    const chunk = this.chunkFor(x, y, z);
    return chunk[localIndex(x, y, z)] as BlockId;
  }

  setBlock(x: number, y: number, z: number, id: BlockId): void {
    const chunk = this.chunkFor(x, y, z);
    chunk[localIndex(x, y, z)] = id;
  }

  /** Anzahl geladener Chunks (für Tests und Anzeige). */
  get loadedChunks(): number {
    return this.chunks.size;
  }

  private chunkFor(x: number, y: number, z: number): Uint8Array {
    const cx = Math.floor(x / CHUNK_SIZE);
    const cy = Math.floor(y / CHUNK_SIZE);
    const cz = Math.floor(z / CHUNK_SIZE);
    const key = `${cx},${cy},${cz}`;
    let chunk = this.chunks.get(key);
    if (!chunk) {
      chunk = generateChunk(this.seed, cx, cy, cz);
      this.chunks.set(key, chunk);
    }
    return chunk;
  }
}

function localIndex(x: number, y: number, z: number): number {
  const lx = mod(x, CHUNK_SIZE);
  const ly = mod(y, CHUNK_SIZE);
  const lz = mod(z, CHUNK_SIZE);
  return lx + ly * CHUNK_SIZE + lz * CHUNK_SIZE * CHUNK_SIZE;
}

function mod(a: number, n: number): number {
  return ((a % n) + n) % n;
}

function generateChunk(seed: number, cx: number, cy: number, cz: number): Uint8Array {
  const chunk = new Uint8Array(CHUNK_SIZE * CHUNK_SIZE * CHUNK_SIZE);
  for (let lz = 0; lz < CHUNK_SIZE; lz++) {
    for (let lx = 0; lx < CHUNK_SIZE; lx++) {
      // Spalte einmal bestimmen, dann alle Höhen dieser Spalte füllen.
      const x = cx * CHUNK_SIZE + lx;
      const z = cz * CHUNK_SIZE + lz;
      const column = columnAt(seed, x, z);
      for (let ly = 0; ly < CHUNK_SIZE; ly++) {
        const y = cy * CHUNK_SIZE + ly;
        chunk[lx + ly * CHUNK_SIZE + lz * CHUNK_SIZE * CHUNK_SIZE] = blockInColumn(seed, column, x, y, z);
      }
    }
  }
  return chunk;
}
