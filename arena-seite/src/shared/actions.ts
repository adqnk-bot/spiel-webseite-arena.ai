import { BlockType, type BlockId } from "./blocks";
import type { Body } from "./physics";
import type { World } from "./world";

/** Reichweite in Blöcken, vom Mittelpunkt des Spielers zum Mittelpunkt des Blocks. */
export const REACH = 5;

/** Liegt der Block innerhalb der Reichweite des Spielers? */
export function inReach(body: Body, bx: number, by: number): boolean {
  const cx = body.x + body.w / 2;
  const cy = body.y + body.h / 2;
  const dx = bx + 0.5 - cx;
  const dy = by + 0.5 - cy;
  return dx * dx + dy * dy <= REACH * REACH;
}

/** Überschneidet der Block den Körper des Spielers? Dann darf dort nichts platziert werden. */
export function overlapsBody(body: Body, bx: number, by: number): boolean {
  return bx < body.x + body.w && bx + 1 > body.x && by < body.y + body.h && by + 1 > body.y;
}

/**
 * Ebene, aus der beim Abbauen ein Block genommen wird: zuerst die aktuelle Ebene,
 * sonst die Ebene dahinter. null, wenn nichts abbaubar ist.
 */
export function mineLayer(world: World, body: Body, bx: number, by: number, z: number): number | null {
  if (!inReach(body, bx, by)) return null;
  for (const lz of [z, z + 1]) {
    if (world.getBlock(bx, by, lz) !== BlockType.Air) return lz;
  }
  return null;
}

/** Baut den Block ab und gibt seine Art zurück. null, wenn nichts abgebaut wurde. */
export function mineAt(world: World, body: Body, bx: number, by: number, z: number): BlockId | null {
  const lz = mineLayer(world, body, bx, by, z);
  if (lz === null) return null;
  const id = world.getBlock(bx, by, lz);
  world.setBlock(bx, by, lz, BlockType.Air);
  return id;
}

/** Darf ein Block in der aktuellen Ebene platziert werden? Nur in der aktuellen Ebene, nie dahinter. */
export function canPlaceAt(world: World, body: Body, bx: number, by: number, z: number): boolean {
  if (!inReach(body, bx, by)) return false;
  if (world.getBlock(bx, by, z) !== BlockType.Air) return false;
  return !overlapsBody(body, bx, by);
}

/** Platziert einen Block in der aktuellen Ebene. Liefert false, wenn es nicht erlaubt ist. */
export function placeAt(world: World, body: Body, bx: number, by: number, z: number, id: BlockId): boolean {
  if (!canPlaceAt(world, body, bx, by, z)) return false;
  world.setBlock(bx, by, z, id);
  return true;
}
