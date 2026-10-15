import { BlockType } from "./blocks";
import { canStandIn, createBody, stepBody, type Body, type MoveInput } from "./physics";
import { zoneAt, type ZoneKind } from "./structures";
import type { ItemId } from "./items";
import type { World } from "./world";

export type MonsterKind = "crawler" | "drone" | "brute";

export interface Drop {
  id: ItemId;
  min: number;
  max: number;
  /** Wahrscheinlichkeit 0 bis 1. */
  chance: number;
}

export interface MonsterDef {
  name: string;
  hp: number;
  /** Schaden pro Berührung in Herzen. */
  damage: number;
  /** Blöcke pro Sekunde. */
  speed: number;
  /** Größe in Blöcken. */
  w: number;
  h: number;
  flying: boolean;
  /** Ab dieser Entfernung (Blöcke) bemerkt das Monster den Spieler. */
  aggro: number;
  drops: Drop[];
}

export const MONSTERS: Record<MonsterKind, MonsterDef> = {
  crawler: {
    name: "Kriecher",
    hp: 3,
    damage: 1,
    speed: 3,
    w: 1,
    h: 0.75,
    flying: false,
    aggro: 18,
    drops: [
      { id: BlockType.Scrap, min: 1, max: 2, chance: 1 },
      { id: "dagger", min: 1, max: 1, chance: 0.08 },
    ],
  },
  drone: {
    name: "Späher",
    hp: 4,
    damage: 1,
    speed: 4,
    w: 1,
    h: 1,
    flying: true,
    aggro: 24,
    drops: [
      { id: BlockType.Glass, min: 1, max: 2, chance: 1 },
      { id: "bow", min: 1, max: 1, chance: 0.12 },
    ],
  },
  brute: {
    name: "Wache",
    hp: 12,
    damage: 2,
    speed: 2.5,
    w: 1,
    h: 2,
    flying: false,
    aggro: 14,
    drops: [
      { id: BlockType.Metal, min: 2, max: 3, chance: 1 },
      { id: "sword", min: 1, max: 1, chance: 0.25 },
      { id: "crossbow", min: 1, max: 1, chance: 0.12 },
    ],
  },
};

export interface Monster {
  id: number;
  kind: MonsterKind;
  body: Body;
  /** Ebene, in der das Monster lebt. Es handelt nur, wenn der Spieler in derselben Ebene steht. */
  z: number;
  hp: number;
  /** Restzeit der Rötungsanzeige nach einem Treffer. */
  hurtTimer: number;
  facing: 1 | -1;
  /** Hängt an einer Wand: dann springt es. */
  blocked: boolean;
}

const NO_INPUT: MoveInput = { left: false, right: false, jump: false };

export function createMonster(id: number, kind: MonsterKind, x: number, y: number, z: number): Monster {
  const def = MONSTERS[kind];
  return {
    id,
    kind,
    body: createBody(x, y, def.w, def.h),
    z,
    hp: def.hp,
    hurtTimer: 0,
    facing: 1,
    blocked: false,
  };
}

/** Macht Schaden. Gibt true zurück, wenn das Monster dabei stirbt. */
export function hurtMonster(m: Monster, damage: number): boolean {
  m.hp -= damage;
  m.hurtTimer = 0.15;
  return m.hp <= 0;
}

/** Bewegt einen fliegenden Körper, ohne in feste Blöcke zu fahren. Jede Achse wird getrennt geprüft. */
function moveFlying(world: World, z: number, body: Body, dx: number, dy: number): void {
  if (canStandIn(world, z, { ...body, x: body.x + dx })) body.x += dx;
  if (canStandIn(world, z, { ...body, y: body.y + dy })) body.y += dy;
}

/**
 * Ein Schritt der Monster-KI. Monster in anderen Ebenen stehen still.
 * `target` ist der Körper des Spielers.
 */
export function updateMonster(world: World, m: Monster, target: Body, layerZ: number, dt: number): void {
  m.hurtTimer = Math.max(0, m.hurtTimer - dt);
  if (m.z !== layerZ) return;

  const def = MONSTERS[m.kind];
  const dx = target.x + target.w / 2 - (m.body.x + def.w / 2);
  const dy = target.y + target.h / 2 - (m.body.y + def.h / 2);
  const dist = Math.hypot(dx, dy);

  if (dist > def.aggro) {
    // Ruhe: Bodenmonster fallen nur, Flieger schweben.
    if (!def.flying) stepBody(world, m.z, m.body, NO_INPUT, dt);
    m.blocked = false;
    return;
  }

  m.facing = dx >= 0 ? 1 : -1;

  if (def.flying) {
    // Schwebt auf den Spieler zu und bleibt knapp vor ihm stehen.
    const want = dist > 1.2 ? def.speed : 0;
    const ux = dist > 0.001 ? dx / dist : 0;
    const uy = dist > 0.001 ? dy / dist : 0;
    moveFlying(world, m.z, m.body, ux * want * dt, uy * want * dt);
    m.blocked = false;
    return;
  }

  // Bodenmonster laufen auf den Spieler zu. Steht eine Wand im Weg, springt es.
  const horizontal = Math.abs(dx) > 0.6;
  const input: MoveInput = {
    left: horizontal && dx < 0,
    right: horizontal && dx > 0,
    jump: m.blocked && m.body.onGround,
    speed: def.speed,
  };
  const x0 = m.body.x;
  stepBody(world, m.z, m.body, input, dt);
  m.blocked = horizontal && m.body.onGround && Math.abs(m.body.x - x0) < 1e-4;
}

// --- Spawn ----------------------------------------------------------------

/** Höchstens so viele Monster in der Nähe des Spielers. */
export const MAX_MONSTERS_NEAR = 12;
/** Radius, in dem Monster als „in der Nähe“ zählen. */
const NEAR_RADIUS = 40;
/** Monster weiter als das werden entfernt. */
const DESPAWN_RADIUS = 60;

interface SpawnRule {
  /** Wahrscheinlichkeit pro Versuch, dass in dieser Zone ein Monster erscheint. */
  chance: number;
  /** Gewichte der Monsterarten in dieser Zone. */
  kinds: Partial<Record<MonsterKind, number>>;
}

/** Je gefährlicher die Zone, desto öfter und stärkere Monster. */
export const SPAWN_RULES: Record<ZoneKind, SpawnRule> = {
  wild: { chance: 0.35, kinds: { crawler: 0.7, drone: 0.3 } },
  city: { chance: 0.6, kinds: { crawler: 0.6, drone: 0.4 } },
  mine: { chance: 0.6, kinds: { crawler: 0.8, drone: 0.2 } },
  tower: { chance: 0.5, kinds: { drone: 0.7, crawler: 0.3 } },
  bunker: { chance: 0.9, kinds: { brute: 0.4, crawler: 0.3, drone: 0.3 } },
  wreck: { chance: 0.9, kinds: { brute: 0.3, drone: 0.5, crawler: 0.2 } },
};

function pickWeighted(weights: Partial<Record<MonsterKind, number>>, rnd: () => number): MonsterKind {
  const entries = Object.entries(weights) as Array<[MonsterKind, number]>;
  const total = entries.reduce((sum, [, w]) => sum + w, 0);
  let roll = rnd() * total;
  for (const [kind, w] of entries) {
    roll -= w;
    if (roll <= 0) return kind;
  }
  return entries[entries.length - 1][0];
}

/**
 * Versucht, ein Monster in der Nähe des Spielers zu erzeugen, in der gleichen Ebene.
 * Der Ort liegt 22 bis 36 Blöcke entfernt, damit es nicht direkt im Bild erscheint.
 * Gibt das neue Monster zurück oder null.
 */
export function trySpawn(
  world: World,
  seed: number,
  target: Body,
  layerZ: number,
  monsters: Monster[],
  nextId: number,
  rnd: () => number = Math.random,
): Monster | null {
  const cx = target.x + target.w / 2;
  const cy = target.y + target.h / 2;
  const near = monsters.filter((m) => m.z === layerZ && Math.hypot(m.body.x - cx, m.body.y - cy) < NEAR_RADIUS).length;
  if (near >= MAX_MONSTERS_NEAR) return null;

  const side = rnd() < 0.5 ? -1 : 1;
  const x = Math.floor(cx + side * (22 + rnd() * 14));
  const py = Math.floor(cy);

  // Zone am Spawn-Punkt bestimmt Chance und Monsterarten.
  const zone = zoneAt(seed, x, py, layerZ);
  const rule = SPAWN_RULES[zone.kind];
  if (rnd() > rule.chance) return null;

  const kind = pickWeighted(rule.kinds, rnd);
  const def = MONSTERS[kind];

  if (def.flying) {
    const y = py - 4 + Math.floor(rnd() * 6);
    const body = createBody(x, y, def.w, def.h);
    if (!canStandIn(world, layerZ, body)) return null;
    return createMonster(nextId, kind, x, y, layerZ);
  }

  // Boden suchen: erste Luftzelle mit fester Zelle darunter, nahe der Spielerhöhe.
  for (let gy = py - 8; gy <= py + 12; gy++) {
    if (world.getBlock(x, gy, layerZ) !== BlockType.Air) continue;
    if (world.getBlock(x, gy + 1, layerZ) === BlockType.Air) continue;
    const body = createBody(x, gy + 1 - def.h, def.w, def.h);
    if (!canStandIn(world, layerZ, body)) return null;
    return createMonster(nextId, kind, body.x, body.y, layerZ);
  }
  return null;
}

/** Entfernt Monster, die zu weit weg oder zu weit von der Spielerebene entfernt sind. */
export function pruneMonsters(monsters: Monster[], target: Body, layerZ: number): Monster[] {
  const cx = target.x + target.w / 2;
  const cy = target.y + target.h / 2;
  return monsters.filter(
    (m) => Math.abs(m.z - layerZ) <= 1 && Math.hypot(m.body.x - cx, m.body.y - cy) < DESPAWN_RADIUS,
  );
}

/** Würfelt die Beute eines Monsters aus. */
export function rollDrops(kind: MonsterKind, rnd: () => number = Math.random): Array<{ id: ItemId; count: number }> {
  const out: Array<{ id: ItemId; count: number }> = [];
  for (const d of MONSTERS[kind].drops) {
    if (rnd() > d.chance) continue;
    const count = d.min + Math.floor(rnd() * (d.max - d.min + 1));
    out.push({ id: d.id, count });
  }
  return out;
}
