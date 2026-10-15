import { BLOCK_COLORS, BLOCK_SIZE, BlockType, type BlockId } from "../../shared/blocks";
import { mineAt, mineLayer, placeAt } from "../../shared/actions";
import { canStandIn, createBody, stepBody, type MoveInput } from "../../shared/physics";
import { zoneAt } from "../../shared/structures";
import { regionName } from "../../shared/terrain";
import { ChunkWorld, type World } from "../../shared/world";
import {
  FIST,
  WEAPONS,
  isPlaceable,
  isWeapon,
  type ItemDrop,
  type MeleeWeapon,
  type RangedWeapon,
} from "../../shared/items";
import { Hotbar, HOTBAR_SIZE } from "../../shared/inventory";
import {
  INVULN_TIME,
  PLAYER_MAX_HP,
  contactDamage,
  meleeBox,
  meleeHit,
  monstersInMelee,
  overlaps,
  stepProjectile,
  type Projectile,
  type Vitals,
} from "../../shared/combat";
import {
  MONSTERS,
  createMonster,
  hurtMonster,
  pruneMonsters,
  rollDrops,
  trySpawn,
  updateMonster,
  type Monster,
} from "../../shared/monsters";
import { openSpriteEditor } from "./editor";
import { tileAt, tileFor } from "./textures";
import { HEART_ART, MONSTER_ART, WEAPON_ART, drawArt } from "./pixelart";
import {
  PLAYER_H_BLOCKS,
  PLAYER_W_BLOCKS,
  drawPlayer,
  loadGrid,
  poseFor,
  saveGrid,
  type AnimState,
  type Grid,
} from "./player-sprite";

/** Bildschirmpixel pro Welt-Pixel (ganzzahlig, damit Pixel-Art scharf bleibt). */
const SCALE = 4;
const BLOCK_SCREEN = BLOCK_SIZE * SCALE;
const FIXED_DT = 1 / 60;
/** Verdunkelung der Ebene hinter der aktuellen (0 = nicht sichtbar, 1 = schwarz). */
const BACK_LAYER_DIM = 0.45;
/** Sekunden zwischen zwei Abbau- oder Platzieraktionen beim Halten der Taste. */
const ACTION_INTERVAL = 0.15;
/** Anzeigezeit des Nahkampf-Blitzes. */
const SWING_TIME = 0.12;
/** Sekunden zwischen zwei Spawn-Versuchen (zufällig gestreut). */
const SPAWN_INTERVAL_MIN = 1;
const SPAWN_INTERVAL_RANGE = 1.5;
/** Reichweite zum Abbauen und Platzieren, in Blöcken. */
const REACH = 5;

export interface GameOptions {
  /** Container, in dem das Spiel läuft. Er wird ganz ausgefüllt und kann in den Vollbildmodus. */
  container: HTMLElement;
  /** Welt-Seed. Gleiche Seeds ergeben die gleiche Welt. */
  seed?: number;
}

export interface GameHandle {
  /** Entfernt Canvas, Schaltflächen und alle Event-Listener. */
  dispose(): void;
}

/** Startet das Spiel in `container`. Gibt ein Handle zurück, mit dem man es wieder beendet. */
export function startGame({ container, seed = 20261015 }: GameOptions): GameHandle {
  const WORLD_SEED = seed;
  const disposers: Array<() => void> = [];
  let disposed = false;

  function on(target: EventTarget, type: string, fn: (e: any) => void, options?: AddEventListenerOptions) {
    target.addEventListener(type, fn as EventListener, options);
    disposers.push(() => target.removeEventListener(type, fn as EventListener, options));
  }

  // --- DOM --------------------------------------------------------------------

  if (getComputedStyle(container).position === "static") container.style.position = "relative";
  container.style.overflow = "hidden";
  container.style.background = "#2a2523";

  const canvas = document.createElement("canvas");
  canvas.style.position = "absolute";
  canvas.style.inset = "0";
  canvas.style.width = "100%";
  canvas.style.height = "100%";
  canvas.style.display = "block";
  container.appendChild(canvas);

  const fsButton = document.createElement("button");
  fsButton.type = "button";
  fsButton.style.cssText =
    "position:absolute;top:10px;right:10px;z-index:5;padding:6px 10px;border:1px solid #6b625d;" +
    "border-radius:6px;background:rgba(0,0,0,0.5);color:#fff;font:13px system-ui,sans-serif;cursor:pointer;";
  container.appendChild(fsButton);

  disposers.push(() => {
    canvas.remove();
    fsButton.remove();
  });

  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D wird nicht unterstützt");
  const c = ctx;

  let cssW = 1;
  let cssH = 1;
  function resize() {
    const rect = container.getBoundingClientRect();
    cssW = Math.max(1, Math.floor(rect.width));
    cssH = Math.max(1, Math.floor(rect.height));
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.floor(cssW * dpr);
    canvas.height = Math.floor(cssH * dpr);
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.imageSmoothingEnabled = false;
  }
  on(window, "resize", resize);
  if (typeof ResizeObserver !== "undefined") {
    const ro = new ResizeObserver(resize);
    ro.observe(container);
    disposers.push(() => ro.disconnect());
  }
  resize();

  // --- Vollbild ---------------------------------------------------------------

  function updateFsButton() {
    fsButton.textContent = document.fullscreenElement === container ? "Vollbild beenden (F)" : "Vollbild (F)";
  }

  async function toggleFullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await container.requestFullscreen();
    } catch {
      // Der Browser hat es verweigert. Dann bleibt das Fenster, wie es ist.
    }
    updateFsButton();
  }

  on(fsButton, "click", () => void toggleFullscreen());
  on(document, "fullscreenchange", () => {
    updateFsButton();
    resize();
  });
  updateFsButton();

  // --- Welt und Spieler -------------------------------------------------------

  const world: World = new ChunkWorld(WORLD_SEED);
  let layerZ = 0;

  /** Sucht von oben die erste feste Stelle am Spawn. */
  function findSpawnY(w: World, x: number, z: number): number {
    let y = 0;
    while (w.getBlock(x, y, z) === BlockType.Air && y < 512) y++;
    return y - PLAYER_H_BLOCKS;
  }
  const SPAWN_X = 0;
  const player = createBody(SPAWN_X, findSpawnY(world, SPAWN_X, 0), PLAYER_W_BLOCKS, PLAYER_H_BLOCKS);
  const vitals: Vitals = { hp: PLAYER_MAX_HP, maxHp: PLAYER_MAX_HP, invuln: 0 };
  /** Die Hotbar startet leer: keine Startblöcke, keine Waffen. */
  const hotbar = new Hotbar();

  let monsters: Monster[] = [];
  let nextMonsterId = 1;
  let projectiles: Projectile[] = [];
  let drops: ItemDrop[] = [];
  let swings: Array<{ x: number; y: number; w: number; h: number; t: number }> = [];
  let spawnTimer = 1;
  const cooldown = { mine: 0, place: 0, attack: 0, shoot: 0 };

  /** Die eigene Figur (Pixel). Wird im Editor bearbeitet und im Browser gespeichert. */
  let sprite: Grid = loadGrid();
  let facing: 1 | -1 = 1;
  let animState: AnimState = "idle";
  let animTime = 0;

  // --- Eingabe ----------------------------------------------------------------

  let editorClose: (() => void) | null = null;
  const keys = new Set<string>();
  const pendingLayerSteps: number[] = [];
  let mouseButton: number | null = null;
  const pointer = { x: -1, y: -1 };
  let originX = 0;
  let originY = 0;

  function openEditor() {
    if (editorClose) return;
    keys.clear();
    pendingLayerSteps.length = 0;
    mouseButton = null;
    editorClose = openSpriteEditor(
      sprite,
      (grid) => {
        sprite = grid;
        saveGrid(grid);
        closeEditor();
      },
      () => closeEditor(),
      container,
    );
  }

  function closeEditor() {
    editorClose?.();
    editorClose = null;
  }

  on(window, "keydown", (e: KeyboardEvent) => {
    if (editorClose) return; // Der Editor bekommt die Tasten.
    const key = e.key.toLowerCase();
    if (key === " " || key === "arrowup") e.preventDefault();
    keys.add(key);
    if (e.repeat) return;
    if (key === "w") pendingLayerSteps.push(1);
    else if (key === "s") pendingLayerSteps.push(-1);
    else if (key === "e") openEditor();
    else if (key === "f") void toggleFullscreen();
    else if (/^[0-9]$/.test(key)) {
      const slot = key === "0" ? 9 : Number(key) - 1;
      if (slot < HOTBAR_SIZE) hotbar.selected = slot;
    }
  });
  on(window, "keyup", (e: KeyboardEvent) => keys.delete(e.key.toLowerCase()));
  on(window, "blur", () => {
    keys.clear();
    pendingLayerSteps.length = 0;
    mouseButton = null;
  });

  function updatePointer(e: PointerEvent) {
    const rect = canvas.getBoundingClientRect();
    pointer.x = e.clientX - rect.left;
    pointer.y = e.clientY - rect.top;
  }
  on(canvas, "pointermove", (e: PointerEvent) => updatePointer(e));
  on(canvas, "pointerleave", () => {
    pointer.x = -1;
    pointer.y = -1;
  });
  on(canvas, "pointerdown", (e: PointerEvent) => {
    if (editorClose) return;
    if (e.button !== 0 && e.button !== 2) return;
    updatePointer(e);
    mouseButton = e.button;
  });
  on(window, "pointerup", () => {
    mouseButton = null;
  });
  on(canvas, "contextmenu", (e: Event) => e.preventDefault());
  on(
    canvas,
    "wheel",
    (e: WheelEvent) => {
      if (editorClose) return;
      e.preventDefault();
      hotbar.step(e.deltaY > 0 ? 1 : -1);
    },
    { passive: false },
  );

  function readInput(): MoveInput {
    if (editorClose) return { left: false, right: false, jump: false };
    return {
      left: keys.has("a") || keys.has("arrowleft"),
      right: keys.has("d") || keys.has("arrowright"),
      jump: keys.has(" ") || keys.has("arrowup"),
    };
  }

  /** Wechselt die Ebene, wenn dort Platz ist. Sonst bleibt der Spieler, wo er ist. */
  function applyLayerSteps() {
    while (pendingLayerSteps.length > 0) {
      const step = pendingLayerSteps.shift()!;
      const target = layerZ + step;
      if (canStandIn(world, target, player)) layerZ = target;
    }
  }

  function pointerWorld() {
    return { wx: (pointer.x - originX) / BLOCK_SCREEN, wy: (pointer.y - originY) / BLOCK_SCREEN };
  }

  function hasPointer(): boolean {
    return pointer.x >= 0 && pointer.y >= 0;
  }

  function playerCenter() {
    return { cx: player.x + player.w / 2, cy: player.y + player.h / 2 };
  }

  // --- Aktionen ---------------------------------------------------------------

  function killMonster(m: Monster) {
    const def = MONSTERS[m.kind];
    const cx = Math.floor(m.body.x + def.w / 2);
    let cy = Math.floor(m.body.y + def.h / 2);
    // Beute fällt bis auf den Boden.
    while (cy < 600 && world.getBlock(cx, cy, m.z) === BlockType.Air && world.getBlock(cx, cy + 1, m.z) === BlockType.Air) cy++;
    for (const d of rollDrops(m.kind)) {
      drops.push({ x: cx, y: cy, z: m.z, id: d.id, count: d.count });
    }
    monsters = monsters.filter((other) => other !== m);
  }

  /** Linksklick: trifft ein Monster im Nahkampfbereich, sonst wird der Block unter dem Mauszeiger abgebaut. */
  function primaryAction() {
    const sel = hotbar.selectedStack;
    const weapon: MeleeWeapon =
      sel && isWeapon(sel.id) && WEAPONS[sel.id].kind === "melee" ? (WEAPONS[sel.id] as MeleeWeapon) : FIST;
    if (hasPointer()) facing = pointerWorld().wx >= playerCenter().cx ? 1 : -1;

    const targets = monstersInMelee(monsters, player, facing, weapon.reach, layerZ);
    if (targets.length > 0) {
      if (cooldown.attack > 0) return;
      for (const m of targets) {
        if (meleeHit(m, weapon.damage)) killMonster(m);
      }
      swings.push({ ...meleeBox(player, facing, weapon.reach), t: SWING_TIME });
      cooldown.attack = weapon.cooldown;
      return;
    }

    if (cooldown.mine > 0 || !hasPointer()) return;
    const { wx, wy } = pointerWorld();
    const bx = Math.floor(wx);
    const by = Math.floor(wy);
    const lz = mineLayer(world, player, bx, by, layerZ);
    if (lz === null) return;
    const id = world.getBlock(bx, by, lz);
    if (!hotbar.canAdd(id)) return; // Kein Platz im Inventar: der Block bleibt.
    mineAt(world, player, bx, by, layerZ);
    hotbar.add(id);
    cooldown.mine = ACTION_INTERVAL;
  }

  /** Rechtsklick: mit Fernwaffe schießen, sonst den ausgewählten Block platzieren. */
  function secondaryAction() {
    const sel = hotbar.selectedStack;
    if (!sel) return;
    if (isWeapon(sel.id)) {
      const w = WEAPONS[sel.id];
      if (w.kind === "ranged") shoot(w);
      return;
    }
    const id = sel.id;
    if (!isPlaceable(id)) return;
    if (cooldown.place > 0 || !hasPointer()) return;
    const { wx, wy } = pointerWorld();
    if (placeAt(world, player, Math.floor(wx), Math.floor(wy), layerZ, id)) {
      hotbar.takeSelected(1);
      cooldown.place = ACTION_INTERVAL;
    }
  }

  /** Schuss in Richtung Mauszeiger. Er endet am Ziel, an einem Block oder an einem Monster. */
  function shoot(w: RangedWeapon) {
    if (cooldown.shoot > 0 || !hasPointer()) return;
    const { cx, cy } = playerCenter();
    const { wx, wy } = pointerWorld();
    const dx = wx - cx;
    const dy = wy - cy;
    const dist = Math.hypot(dx, dy);
    if (dist < 0.05) return;
    projectiles.push({
      x: cx,
      y: cy,
      dx: dx / dist,
      dy: dy / dist,
      speed: w.speed,
      z: layerZ,
      traveled: 0,
      maxDist: Math.min(dist, w.range),
      damage: w.damage,
    });
    cooldown.shoot = w.cooldown;
    facing = dx >= 0 ? 1 : -1;
  }

  function respawn() {
    monsters = [];
    projectiles = [];
    player.x = SPAWN_X;
    player.y = findSpawnY(world, SPAWN_X, 0);
    player.vx = 0;
    player.vy = 0;
    layerZ = 0;
    vitals.hp = vitals.maxHp;
    vitals.invuln = INVULN_TIME * 2;
  }

  // --- Schleife ---------------------------------------------------------------

  function updateAnimation(dt: number) {
    if (player.vx > 0.01) facing = 1;
    else if (player.vx < -0.01) facing = -1;
    const next: AnimState = !player.onGround
      ? player.vy < 0
        ? "jump"
        : "fall"
      : Math.abs(player.vx) > 0.01
        ? "walk"
        : "idle";
    if (next !== animState) {
      animState = next;
      animTime = 0;
    }
    animTime += dt;
  }

  function step(dt: number) {
    applyLayerSteps();
    stepBody(world, layerZ, player, readInput(), dt);
    updateAnimation(dt);

    cooldown.mine = Math.max(0, cooldown.mine - dt);
    cooldown.place = Math.max(0, cooldown.place - dt);
    cooldown.attack = Math.max(0, cooldown.attack - dt);
    cooldown.shoot = Math.max(0, cooldown.shoot - dt);
    vitals.invuln = Math.max(0, vitals.invuln - dt);
    swings = swings.map((s) => ({ ...s, t: s.t - dt })).filter((s) => s.t > 0);

    if (mouseButton === 0) primaryAction();
    else if (mouseButton === 2) secondaryAction();

    projectiles = projectiles.filter((p) => {
      const r = stepProjectile(world, p, dt, monsters);
      if (r.hit && hurtMonster(r.hit, p.damage)) killMonster(r.hit);
      return !r.done;
    });

    for (const m of monsters) updateMonster(world, m, player, layerZ, dt);

    spawnTimer -= dt;
    if (spawnTimer <= 0) {
      spawnTimer = SPAWN_INTERVAL_MIN + Math.random() * SPAWN_INTERVAL_RANGE;
      const m = trySpawn(world, WORLD_SEED, player, layerZ, monsters, nextMonsterId);
      if (m) {
        nextMonsterId++;
        monsters.push(m);
      }
    }
    monsters = pruneMonsters(monsters, player, layerZ);

    if (contactDamage(vitals, player, monsters, layerZ) && vitals.hp <= 0) respawn();

    // Beute aufsammeln, wenn der Spieler sie berührt und Platz ist.
    const pickup = { x: player.x - 0.5, y: player.y - 0.5, w: player.w + 1, h: player.h + 1 };
    drops = drops.filter((d) => {
      if (d.z !== layerZ || !overlaps(pickup, { x: d.x, y: d.y, w: 1, h: 1 })) return true;
      return !hotbar.add(d.id, d.count);
    });
  }

  // --- Zeichnen ---------------------------------------------------------------

  function drawLayer(z: number, dim: boolean, bounds: { minX: number; maxX: number; minY: number; maxY: number }) {
    for (let by = bounds.minY; by <= bounds.maxY; by++) {
      for (let bx = bounds.minX; bx <= bounds.maxX; bx++) {
        const id = world.getBlock(bx, by, z);
        if (id === BlockType.Air) continue;
        const px = originX + bx * BLOCK_SCREEN;
        const py = originY + by * BLOCK_SCREEN;
        const tile = tileAt(id, bx, by);
        if (tile) c.drawImage(tile, px, py, BLOCK_SCREEN, BLOCK_SCREEN);
        else {
          c.fillStyle = BLOCK_COLORS[id as BlockId];
          c.fillRect(px, py, BLOCK_SCREEN, BLOCK_SCREEN);
        }
        if (dim) {
          c.fillStyle = `rgba(0, 0, 0, ${BACK_LAYER_DIM})`;
          c.fillRect(px, py, BLOCK_SCREEN, BLOCK_SCREEN);
        }
      }
    }
  }

  function drawMonsters(z: number, back: boolean) {
    for (const m of monsters) {
      if (m.z !== z) continue;
      const def = MONSTER_ART[m.kind];
      const mdef = MONSTERS[m.kind];
      const x = Math.round(originX + m.body.x * BLOCK_SCREEN);
      const y = Math.round(originY + m.body.y * BLOCK_SCREEN);
      const alpha = (back ? 0.55 : 1) * (m.hurtTimer > 0 ? 0.6 : 1);
      drawArt(c, def, x, y, SCALE, m.facing < 0, alpha);
      if (!back && m.hp < mdef.hp) {
        const barW = mdef.w * BLOCK_SCREEN;
        c.fillStyle = "#1a1a1a";
        c.fillRect(x, y - 6, barW, 3);
        c.fillStyle = m.hp / mdef.hp > 0.5 ? "#6fcf4a" : "#e5484d";
        c.fillRect(x, y - 6, barW * (m.hp / mdef.hp), 3);
      }
    }
  }

  function drawDrops() {
    for (const d of drops) {
      if (d.z !== layerZ) continue;
      const x = Math.round(originX + d.x * BLOCK_SCREEN + 4);
      const y = Math.round(originY + d.y * BLOCK_SCREEN + 4);
      if (isWeapon(d.id)) {
        drawArt(c, WEAPON_ART[d.id], x, y, 3);
      } else {
        const tile = tileFor(d.id, false);
        if (tile) c.drawImage(tile, x, y, 24, 24);
        else {
          c.fillStyle = BLOCK_COLORS[d.id];
          c.fillRect(x, y, 24, 24);
        }
      }
      if (d.count > 1) {
        c.fillStyle = "#ffffff";
        c.font = "11px system-ui, sans-serif";
        c.textAlign = "left";
        c.fillText(String(d.count), x + 20, y + 26);
      }
    }
  }

  function drawProjectiles() {
    c.lineWidth = 2;
    for (const p of projectiles) {
      if (p.z !== layerZ) continue;
      const x1 = originX + p.x * BLOCK_SCREEN;
      const y1 = originY + p.y * BLOCK_SCREEN;
      const x0 = x1 - p.dx * 1.2 * BLOCK_SCREEN;
      const y0 = y1 - p.dy * 1.2 * BLOCK_SCREEN;
      c.strokeStyle = "#f3e3c3";
      c.beginPath();
      c.moveTo(x0, y0);
      c.lineTo(x1, y1);
      c.stroke();
    }
  }

  /** Punktlinie zum Zielpunkt, nur mit Fernwaffe in der Hand. */
  function drawAimLine() {
    const sel = hotbar.selectedStack;
    if (!sel || !isWeapon(sel.id) || WEAPONS[sel.id].kind !== "ranged" || !hasPointer()) return;
    const w = WEAPONS[sel.id] as RangedWeapon;
    const { cx, cy } = playerCenter();
    const { wx, wy } = pointerWorld();
    const dist = Math.min(Math.hypot(wx - cx, wy - cy), w.range);
    const ang = Math.atan2(wy - cy, wx - cx);
    c.save();
    c.strokeStyle = "rgba(255,255,255,0.35)";
    c.setLineDash([4, 6]);
    c.lineWidth = 1;
    c.beginPath();
    c.moveTo(originX + cx * BLOCK_SCREEN, originY + cy * BLOCK_SCREEN);
    c.lineTo(originX + (cx + Math.cos(ang) * dist) * BLOCK_SCREEN, originY + (cy + Math.sin(ang) * dist) * BLOCK_SCREEN);
    c.stroke();
    c.restore();
  }

  function drawSwings() {
    for (const s of swings) {
      c.fillStyle = `rgba(255,255,255,${(s.t / SWING_TIME) * 0.35})`;
      c.fillRect(originX + s.x * BLOCK_SCREEN, originY + s.y * BLOCK_SCREEN, s.w * BLOCK_SCREEN, s.h * BLOCK_SCREEN);
    }
  }

  function drawPlayerFigure() {
    const px = Math.round(originX + player.x * BLOCK_SCREEN);
    const py = Math.round(originY + player.y * BLOCK_SCREEN);
    const blink = vitals.invuln > 0 && Math.floor(vitals.invuln * 10) % 2 === 0;
    c.save();
    if (blink) c.globalAlpha = 0.4;
    drawPlayer(c, sprite, poseFor(animState, animTime), px, py, SCALE, facing < 0);
    // Ausgewählte Waffe in der Hand.
    const sel = hotbar.selectedStack;
    if (sel && isWeapon(sel.id)) {
      const iconScale = 3;
      const ix = facing > 0 ? px + 8 * SCALE - 6 : px - 8 * iconScale + 6;
      const iy = py + 9 * SCALE - 6;
      drawArt(c, WEAPON_ART[sel.id], ix, iy, iconScale, facing < 0);
    }
    c.restore();
  }

  /** Markiert den Block unter dem Mauszeiger. Weiß = erreichbar, grau = nicht abbaubar, rot = zu weit weg. */
  function drawTarget() {
    if (!hasPointer()) return;
    const { wx, wy } = pointerWorld();
    const bx = Math.floor(wx);
    const by = Math.floor(wy);
    const { cx, cy } = playerCenter();
    const reachable = Math.hypot(bx + 0.5 - cx, by + 0.5 - cy) <= REACH;
    const canMine = mineLayer(world, player, bx, by, layerZ) !== null;
    const color = !reachable ? "#ff5555" : canMine ? "#ffffff" : "#aaaaaa";
    c.strokeStyle = color;
    c.lineWidth = 2;
    c.strokeRect(originX + bx * BLOCK_SCREEN + 1, originY + by * BLOCK_SCREEN + 1, BLOCK_SCREEN - 2, BLOCK_SCREEN - 2);
  }

  function drawHearts() {
    const hearts = Math.ceil(vitals.maxHp);
    for (let i = 0; i < hearts; i++) {
      const alpha = i < Math.ceil(vitals.hp) ? 1 : 0.25;
      drawArt(c, HEART_ART, 12 + i * 18, 12, 2, false, alpha);
    }
  }

  function drawHotbar() {
    const slot = 44;
    const gap = 4;
    const total = HOTBAR_SIZE * slot - gap;
    const startX = Math.round((cssW - total) / 2);
    const y = cssH - slot - 12;
    for (let i = 0; i < HOTBAR_SIZE; i++) {
      const x = startX + i * slot;
      const stack = hotbar.slots[i];
      c.fillStyle = "rgba(0, 0, 0, 0.45)";
      c.fillRect(x, y, slot - gap, slot - gap);
      if (stack) {
        if (isWeapon(stack.id)) {
          drawArt(c, WEAPON_ART[stack.id], x + 4, y + 4, 4);
        } else {
          const tile = tileFor(stack.id, false);
          if (tile) c.drawImage(tile, x + 4, y + 4, 32, 32);
          else {
            c.fillStyle = BLOCK_COLORS[stack.id];
            c.fillRect(x + 4, y + 4, 32, 32);
          }
        }
        c.font = "11px system-ui, sans-serif";
        c.textAlign = "right";
        c.fillStyle = "#ffffff";
        if (stack.count > 1) c.fillText(String(stack.count), x + slot - gap - 3, y + slot - gap - 3);
      }
      c.font = "11px system-ui, sans-serif";
      c.textAlign = "left";
      c.fillStyle = "#ffffff";
      c.fillText(i === 9 ? "0" : String(i + 1), x + 3, y + 11);
      if (i === hotbar.selected) {
        c.strokeStyle = "#ffffff";
        c.lineWidth = 2;
        c.strokeRect(x + 1, y + 1, slot - gap - 2, slot - gap - 2);
      }
    }
  }

  function drawHud() {
    const px = Math.floor(player.x);
    const py = Math.floor(player.y);
    const zone = zoneAt(WORLD_SEED, px, py, layerZ);
    c.textAlign = "left";
    c.fillStyle = "#ffffff";
    c.font = "14px system-ui, sans-serif";
    c.fillText(`Ebene ${layerZ} · ${regionName(WORLD_SEED, px, py, layerZ)} · ${zone.name} · Monster: ${monsters.length}`, 12, 60);
    c.font = "13px system-ui, sans-serif";
    c.fillText(
      "A/D laufen · Leertaste/↑ springen · W/S Ebene · Links: abbauen/schlagen · Rechts: platzieren/schießen · 1–0/Mausrad Auswahl · E Figur · F Vollbild",
      12,
      80,
    );
    if (hotbar.slots.every((s) => s === null)) {
      c.textAlign = "center";
      c.font = "15px system-ui, sans-serif";
      c.fillText("Keine Gegenstände. Baue Blöcke ab (Linksklick). Monster lassen Waffen fallen.", cssW / 2, cssH / 2 - 80);
    }
  }

  function render() {
    c.fillStyle = "#2a2523";
    c.fillRect(0, 0, cssW, cssH);

    // Kamera: Spieler in der Mitte.
    const { cx, cy } = playerCenter();
    originX = Math.round(cssW / 2 - cx * BLOCK_SCREEN);
    originY = Math.round(cssH / 2 - cy * BLOCK_SCREEN);
    const bounds = {
      minX: Math.floor(-originX / BLOCK_SCREEN) - 1,
      maxX: Math.floor((cssW - originX) / BLOCK_SCREEN) + 1,
      minY: Math.floor(-originY / BLOCK_SCREEN) - 1,
      maxY: Math.floor((cssH - originY) / BLOCK_SCREEN) + 1,
    };

    // Reihenfolge: hintere Ebene (abgedunkelt), aktuelle Ebene, Figuren, Vordergrund-HUD.
    drawLayer(layerZ + 1, true, bounds);
    drawMonsters(layerZ + 1, true);
    drawLayer(layerZ, false, bounds);
    drawDrops();
    drawMonsters(layerZ, false);
    drawProjectiles();
    drawSwings();
    drawPlayerFigure();
    drawAimLine();
    drawTarget();
    drawHearts();
    drawHotbar();
    drawHud();
  }

  // --- Start ------------------------------------------------------------------

  let last = performance.now();
  let accumulator = 0;
  let rafId = 0;

  function frame(now: number) {
    if (disposed) return;
    accumulator += Math.min((now - last) / 1000, 0.25);
    last = now;
    while (accumulator >= FIXED_DT) {
      if (!editorClose) step(FIXED_DT);
      accumulator -= FIXED_DT;
    }
    render();
    rafId = requestAnimationFrame(frame);
  }
  rafId = requestAnimationFrame(frame);
  disposers.push(() => cancelAnimationFrame(rafId));

  return {
    dispose() {
      if (disposed) return;
      disposed = true;
      closeEditor();
      if (document.fullscreenElement === container) void document.exitFullscreen();
      for (const d of disposers.reverse()) d();
      disposers.length = 0;
    },
  };
}
