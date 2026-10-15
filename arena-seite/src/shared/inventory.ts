import { maxStack, type ItemId } from "./items";

/** Anzahl der Plätze in der Hotbar (Tasten 1 bis 0). */
export const HOTBAR_SIZE = 10;

export interface Stack {
  id: ItemId;
  count: number;
}

/**
 * Hotbar mit zehn Plätzen. Am Anfang ist alles leer, es gibt keine Startblöcke.
 * Gleiche Blöcke stapeln sich, Waffen belegen je einen Platz.
 */
export class Hotbar {
  readonly slots: (Stack | null)[] = Array.from({ length: HOTBAR_SIZE }, () => null);
  selected = 0;

  get selectedStack(): Stack | null {
    return this.slots[this.selected];
  }

  /** Passt die Menge noch in die Hotbar? */
  canAdd(id: ItemId, count = 1): boolean {
    let remaining = count;
    for (const slot of this.slots) {
      if (slot && slot.id === id) {
        remaining -= Math.min(maxStack(id) - slot.count, remaining);
        if (remaining <= 0) return true;
      }
    }
    const freeSlots = this.slots.filter((s) => s === null).length;
    return freeSlots * maxStack(id) >= remaining;
  }

  /** Fügt Gegenstände hinzu. Gibt false zurück, wenn sie nicht hineinpassen (dann passiert nichts). */
  add(id: ItemId, count = 1): boolean {
    if (!this.canAdd(id, count)) return false;
    let remaining = count;
    for (const slot of this.slots) {
      if (remaining <= 0) break;
      if (slot && slot.id === id) {
        const put = Math.min(maxStack(id) - slot.count, remaining);
        slot.count += put;
        remaining -= put;
      }
    }
    for (let i = 0; i < this.slots.length && remaining > 0; i++) {
      if (this.slots[i] === null) {
        const put = Math.min(maxStack(id), remaining);
        this.slots[i] = { id, count: put };
        remaining -= put;
      }
    }
    return true;
  }

  /** Entfernt einen Gegenstand aus dem ausgewählten Platz. Leere Plätze werden frei. */
  takeSelected(count = 1): boolean {
    const slot = this.slots[this.selected];
    if (!slot || slot.count < count) return false;
    slot.count -= count;
    if (slot.count === 0) this.slots[this.selected] = null;
    return true;
  }

  /** Wechselt den Platz relativ, z. B. mit dem Mausrad. */
  step(delta: number): void {
    this.selected = (this.selected + delta + HOTBAR_SIZE) % HOTBAR_SIZE;
  }
}
