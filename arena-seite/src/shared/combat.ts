import { BlockType, type BlockId } from "./blocks";
import type { Body } from "./physics";
import { MONSTERS, hurtMonster, type Monster } from "./monsters";
import type { World } from "./world";

/** Lebenspunkte des Spielers. Ein Herz entspricht einem Punkt. */
export const PLAYER_MAX_HP = 10;
/** Sekunden Unverwundbarkeit nach einem Treffer. */
export const INVULN_TIME = 1;
/** Schrittweite des Projektils in Blöcken. Kleiner als 1, damit dünne Wände nicht übersprungen werden. */
export const PROJECTILE_STEP = 0.25;

export interface Vitals {
  hp: number;
  maxHp: number;
  /** Restzeit der Unverwundbarkeit in Sekunden. */
  invuln: number;
}

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Projectile {
  x: number;
  y: number;
  /** Richtung als Einheitsvektor. */
  dx: number;
  dy: number;
  speed: number;
  z: number;
  traveled: number;
  maxDist: number;
  damage: number;
}

export function overlaps(a: Box, b: Box): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

export function bodyBox(body: Body): Box {
  return { x: body.x, y: body.y, w: body.w, h: body.h };
}

export function monsterBox(m: Monster): Box {
  const def = MONSTERS[m.kind];
  return { x: m.body.x, y: m.body.y, w: def.w, h: def.h };
}

/**
 * Nahkampf-Trefferbereich: ein Rechteck vor dem Spieler, so hoch wie der Körper,
 * `reach` Blöcke breit, auf der Seite, in die gezielt wird.
 */
export function meleeBox(body: Body, facing: 1 | -1, reach: number): Box {
  const x = facing > 0 ? body.x + body.w : body.x - reach;
  return { x, y: body.y, w: reach, h: body.h };
}

/** Alle Monster in der Ebene z, die im Nahkampfbereich stehen. */
export function monstersInMelee(
  monsters: Monster[],
  body: Body,
  facing: 1 | -1,
  reach: number,
  z: number,
): Monster[] {
  const box = meleeBox(body, facing, reach);
  return monsters.filter((m) => m.z === z && overlaps(box, monsterBox(m)));
}

/** Macht Schaden an einem Monster. Gibt true zurück, wenn es dabei stirbt. */
export function meleeHit(m: Monster, damage: number): boolean {
  return hurtMonster(m, damage);
}

/**
 * Bewegt ein Projektil in kleinen Schritten. Es stoppt bei einem festen Block (Ebene z),
 * bei einem Monster in derselben Ebene oder wenn die maximale Strecke erreicht ist.
 */
export function stepProjectile(
  world: World,
  p: Projectile,
  dt: number,
  monsters: Monster[],
): { hit: Monster | null; done: boolean } {
  let budget = p.speed * dt;
  while (budget > 0) {
    const step = Math.min(PROJECTILE_STEP, budget);
    budget -= step;
    p.x += p.dx * step;
    p.y += p.dy * step;
    p.traveled += step;

    const bx = Math.floor(p.x);
    const by = Math.floor(p.y);
    const id: BlockId = world.getBlock(bx, by, p.z);
    if (id !== BlockType.Air) return { hit: null, done: true };

    for (const m of monsters) {
      if (m.z !== p.z) continue;
      const box = monsterBox(m);
      if (p.x >= box.x && p.x <= box.x + box.w && p.y >= box.y && p.y <= box.y + box.h) {
        return { hit: m, done: true };
      }
    }
    if (p.traveled >= p.maxDist) return { hit: null, done: true };
  }
  return { hit: null, done: false };
}

/**
 * Berührungsschaden: Ein Monster in derselben Ebene, das den Spieler berührt, verletzt ihn.
 * Danach gilt eine kurze Unverwundbarkeit. Gibt true zurück, wenn der Spieler Schaden nimmt.
 */
export function contactDamage(v: Vitals, body: Body, monsters: Monster[], z: number): boolean {
  if (v.invuln > 0) return false;
  const box = bodyBox(body);
  for (const m of monsters) {
    if (m.z !== z) continue;
    if (overlaps(box, monsterBox(m))) {
      v.hp -= MONSTERS[m.kind].damage;
      v.invuln = INVULN_TIME;
      return true;
    }
  }
  return false;
}
