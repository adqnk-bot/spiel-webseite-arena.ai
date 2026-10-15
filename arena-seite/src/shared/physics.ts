import { BlockType } from "./blocks";
import type { World } from "./world";

/** Alle Maße in Blöcken (nicht in Pixeln). */
export const GRAVITY = 30;
export const MAX_FALL_SPEED = 25;
export const MOVE_SPEED = 7;
export const JUMP_VELOCITY = 10;

/** Kleiner Wert, damit eine Kante genau auf einer Blockgrenze nicht als Kollision zählt. */
const EPS = 1e-6;

export interface Body {
  /** Linke obere Ecke. */
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Breite und Höhe in Blöcken. */
  w: number;
  h: number;
  onGround: boolean;
}

export interface MoveInput {
  left: boolean;
  right: boolean;
  jump: boolean;
  /** Laufgeschwindigkeit in Blöcken pro Sekunde. Ohne Angabe gilt MOVE_SPEED (Spieler). */
  speed?: number;
}

export function createBody(x: number, y: number, w: number, h: number): Body {
  return { x, y, vx: 0, vy: 0, w, h, onGround: false };
}

function collides(world: World, z: number, x: number, y: number, w: number, h: number): boolean {
  const x0 = Math.floor(x);
  const x1 = Math.floor(x + w - EPS);
  const y0 = Math.floor(y);
  const y1 = Math.floor(y + h - EPS);
  for (let by = y0; by <= y1; by++) {
    for (let bx = x0; bx <= x1; bx++) {
      if (world.getBlock(bx, by, z) !== BlockType.Air) return true;
    }
  }
  return false;
}

/** Prüft, ob der Körper an seiner aktuellen Position in Ebene z Platz hat (keine Kollision). */
export function canStandIn(world: World, z: number, body: Body): boolean {
  return !collides(world, z, body.x, body.y, body.w, body.h);
}

/**
 * Bewegt den Körper für einen Zeitschritt. Die Achsen werden getrennt
 * geprüft: erst X, dann Y. So gleitet man an Wänden entlang und landet
 * sauber auf dem Boden.
 */
export function stepBody(world: World, z: number, body: Body, input: MoveInput, dt: number): void {
  // Horizontale Geschwindigkeit direkt aus der Eingabe (ohne Beschleunigung).
  const speed = input.speed ?? MOVE_SPEED;
  body.vx = (input.right ? 1 : 0) * speed - (input.left ? 1 : 0) * speed;

  if (input.jump && body.onGround) {
    body.vy = -JUMP_VELOCITY;
  }

  // Schwerkraft
  body.vy = Math.min(body.vy + GRAVITY * dt, MAX_FALL_SPEED);

  // X-Achse
  const nx = body.x + body.vx * dt;
  if (!collides(world, z, nx, body.y, body.w, body.h)) {
    body.x = nx;
  } else if (body.vx > 0) {
    body.x = Math.floor(nx + body.w - EPS) - body.w;
    body.vx = 0;
  } else if (body.vx < 0) {
    body.x = Math.floor(nx) + 1;
    body.vx = 0;
  }

  // Y-Achse
  body.onGround = false;
  const ny = body.y + body.vy * dt;
  if (!collides(world, z, body.x, ny, body.w, body.h)) {
    body.y = ny;
  } else if (body.vy > 0) {
    body.y = Math.floor(ny + body.h - EPS) - body.h;
    body.vy = 0;
    body.onGround = true;
  } else if (body.vy < 0) {
    body.y = Math.floor(ny) + 1;
    body.vy = 0;
  }
}
