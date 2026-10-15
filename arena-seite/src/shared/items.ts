import { BlockType, type BlockId } from "./blocks";

/** Waffen. Strings, damit sie nicht mit den Block-Nummern kollidieren. */
export type WeaponId = "dagger" | "sword" | "bow" | "crossbow";

/** Ein Gegenstand ist ein Block (Zahl) oder eine Waffe (Name). */
export type ItemId = BlockId | WeaponId;

export interface MeleeWeapon {
  kind: "melee";
  name: string;
  /** Reichweite in Blöcken, vom Rand des Spielers aus in Blickrichtung. */
  reach: number;
  damage: number;
  /** Sekunden zwischen zwei Schlägen. */
  cooldown: number;
}

export interface RangedWeapon {
  kind: "ranged";
  name: string;
  damage: number;
  cooldown: number;
  /** Blöcke pro Sekunde. */
  speed: number;
  /** Höchstens so weit fliegt der Schuss (ungefähr die Bildschirmbreite). */
  range: number;
}

export type Weapon = MeleeWeapon | RangedWeapon;

export const WEAPONS: Record<WeaponId, Weapon> = {
  dagger: { kind: "melee", name: "Dolch", reach: 2, damage: 3, cooldown: 0.35 },
  sword: { kind: "melee", name: "Schwert", reach: 2, damage: 5, cooldown: 0.55 },
  bow: { kind: "ranged", name: "Bogen", damage: 4, cooldown: 0.6, speed: 40, range: 36 },
  crossbow: { kind: "ranged", name: "Armbrust", damage: 7, cooldown: 1.1, speed: 55, range: 36 },
};

/** Ohne Waffe in der Hand schlägt man mit den Fäusten (kurze Reichweite, wenig Schaden). */
export const FIST: MeleeWeapon = { kind: "melee", name: "Fäuste", reach: 2, damage: 1, cooldown: 0.5 };

export function isWeapon(id: ItemId): id is WeaponId {
  return typeof id === "string";
}

export function isBlockItem(id: ItemId): id is BlockId {
  return typeof id === "number";
}

/** Blöcke stapeln sich, Waffen nicht. */
export function maxStack(id: ItemId): number {
  return isWeapon(id) ? 1 : 999;
}

/** Blöcke, die man platzieren darf. Schlacke wird abgebaut und gespeichert, aber nicht platziert. */
export function isPlaceable(id: ItemId): id is BlockId {
  return isBlockItem(id) && id !== BlockType.Air && id !== BlockType.Slag;
}

/** Gegenstand, der auf dem Boden liegt und aufgesammelt werden kann. */
export interface ItemDrop {
  x: number;
  y: number;
  z: number;
  id: ItemId;
  count: number;
}
