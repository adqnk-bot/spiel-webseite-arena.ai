import {
  AnimState,
  drawPlayer,
  Grid,
  poseFor,
  SPRITE_H,
  SPRITE_W,
  templateGrid,
} from "./player-sprite";

/** Anzeigegröße eines Sprite-Pixels im Editor (CSS-Pixel). */
const EDIT_SCALE = 24;
const PREVIEW_SCALE = 6;

const SWATCHES = [
  "#1a1a1a",
  "#ffffff",
  "#e0b08a",
  "#c08a60",
  "#3b2a20",
  "#8a4b3b",
  "#2e86ab",
  "#1f5f7a",
  "#34495e",
  "#2b1d14",
  "#c0392b",
  "#f2c94c",
  "#4f9a3a",
  "#7b4b35",
  "#e8ecf1",
  "#aeb8c4",
  "#1d3f57",
  "#7fd0e6",
  "#f08a3c",
  "#4b5563",
  "#2d3440",
];

/**
 * Öffnet den Figur-Editor. Gibt eine Funktion zurück, die den Editor wieder schließt.
 * `onSave` bekommt das Ergebnis beim Speichern, `onClose` wird beim Abbrechen aufgerufen.
 */
export function openSpriteEditor(
  initial: Grid,
  onSave: (grid: Grid) => void,
  onClose: () => void,
  parent: HTMLElement = document.body,
): () => void {
  const grid: Grid = [...initial];
  let color = SWATCHES[0];
  let tool: "pen" | "eraser" = "pen";
  let running = true;

  const overlay = el("div", {
    position: "fixed",
    inset: "0",
    background: "rgba(0,0,0,0.72)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: "10",
    fontFamily: "system-ui, sans-serif",
    color: "#fff",
  });
  const panel = el("div", {
    background: "#2a2523",
    padding: "20px",
    borderRadius: "10px",
    display: "flex",
    gap: "24px",
    alignItems: "flex-start",
    boxShadow: "0 10px 40px rgba(0,0,0,0.5)",
  });

  // Links: Editierfläche und Werkzeuge
  const left = el("div", { display: "flex", flexDirection: "column", gap: "12px" });
  const title = el("div", { fontSize: "18px", fontWeight: "600" });
  title.textContent = "Figur bearbeiten";

  const edit = document.createElement("canvas");
  edit.width = SPRITE_W;
  edit.height = SPRITE_H;
  Object.assign(edit.style, {
    width: `${SPRITE_W * EDIT_SCALE}px`,
    height: `${SPRITE_H * EDIT_SCALE}px`,
    imageRendering: "pixelated",
    background: "repeating-conic-gradient(#555 0% 25%, #444 0% 50%) 50% / 16px 16px",
    cursor: "crosshair",
    touchAction: "none",
    borderRadius: "4px",
  });

  const swatchRow = el("div", { display: "grid", gridTemplateColumns: "repeat(7, 26px)", gap: "6px" });
  for (const s of SWATCHES) {
    const b = button("", () => {
      color = s;
      tool = "pen";
      refreshTools();
    });
    b.style.background = s;
    b.style.width = "26px";
    b.style.height = "26px";
    b.style.padding = "0";
    b.dataset.swatch = s;
    swatchRow.appendChild(b);
  }

  const colorInput = document.createElement("input");
  colorInput.type = "color";
  colorInput.value = color;
  colorInput.style.width = "100%";
  colorInput.style.height = "32px";
  colorInput.addEventListener("input", () => {
    color = colorInput.value;
    tool = "pen";
    refreshTools();
  });

  const penBtn = button("Stift", () => {
    tool = "pen";
    refreshTools();
  });
  const eraserBtn = button("Radierer", () => {
    tool = "eraser";
    refreshTools();
  });
  const toolRow = el("div", { display: "flex", gap: "6px" });
  toolRow.append(penBtn, eraserBtn);

  const actionRow = el("div", { display: "flex", gap: "6px", flexWrap: "wrap" });
  actionRow.append(
    button("Vorlage laden", () => {
      const t = templateGrid();
      for (let i = 0; i < t.length; i++) grid[i] = t[i];
      draw();
    }),
    button("Speichern", () => onSave(grid)),
    button("Abbrechen", () => onClose()),
  );

  const hint = el("div", { fontSize: "12px", opacity: "0.7", maxWidth: `${SPRITE_W * EDIT_SCALE}px` });
  hint.textContent = "Linksklick malt, Rechtsklick radiert. Änderungen gelten erst nach Speichern.";

  left.append(title, edit, swatchRow, colorInput, toolRow, actionRow, hint);

  // Rechts: Vorschau mit Animationen
  const right = el("div", { display: "flex", flexDirection: "column", gap: "12px", alignItems: "center" });
  const previewTitle = el("div", { fontSize: "14px", opacity: "0.8" });
  previewTitle.textContent = "Vorschau";
  const previewIdle = document.createElement("canvas");
  const previewWalk = document.createElement("canvas");
  for (const p of [previewIdle, previewWalk]) {
    p.width = SPRITE_W * PREVIEW_SCALE + 12;
    p.height = SPRITE_H * PREVIEW_SCALE + 12;
    p.style.background = "#3a3431";
    p.style.borderRadius = "6px";
  }
  const labelIdle = el("div", { fontSize: "12px", opacity: "0.7" });
  labelIdle.textContent = "Stehen";
  const labelWalk = el("div", { fontSize: "12px", opacity: "0.7" });
  labelWalk.textContent = "Laufen";
  right.append(previewTitle, labelIdle, previewIdle, labelWalk, previewWalk);

  panel.append(left, right);
  overlay.appendChild(panel);
  parent.appendChild(overlay);

  function refreshTools() {
    for (const b of Array.from(swatchRow.querySelectorAll("button"))) {
      const active = tool === "pen" && b.dataset.swatch === color;
      b.style.outline = active ? "2px solid #fff" : "none";
    }
    penBtn.style.outline = tool === "pen" ? "2px solid #fff" : "none";
    eraserBtn.style.outline = tool === "eraser" ? "2px solid #fff" : "none";
  }

  const editCtx = edit.getContext("2d")!;
  function draw() {
    editCtx.clearRect(0, 0, SPRITE_W, SPRITE_H);
    for (let y = 0; y < SPRITE_H; y++) {
      for (let x = 0; x < SPRITE_W; x++) {
        const c = grid[y * SPRITE_W + x];
        if (!c) continue;
        editCtx.fillStyle = c;
        editCtx.fillRect(x, y, 1, 1);
      }
    }
  }

  function paintAt(e: PointerEvent, erase: boolean) {
    const rect = edit.getBoundingClientRect();
    const x = Math.floor(((e.clientX - rect.left) / rect.width) * SPRITE_W);
    const y = Math.floor(((e.clientY - rect.top) / rect.height) * SPRITE_H);
    if (x < 0 || y < 0 || x >= SPRITE_W || y >= SPRITE_H) return;
    grid[y * SPRITE_W + x] = erase ? null : color;
    draw();
  }

  edit.addEventListener("pointerdown", (e) => {
    edit.setPointerCapture(e.pointerId);
    const erase = e.button === 2 || tool === "eraser";
    paintAt(e, erase);
  });
  edit.addEventListener("pointermove", (e) => {
    if (e.buttons & 1) paintAt(e, tool === "eraser");
    else if (e.buttons & 2) paintAt(e, true);
  });
  edit.addEventListener("contextmenu", (e) => e.preventDefault());

  // Vorschau-Schleife
  const idleCtx = previewIdle.getContext("2d")!;
  const walkCtx = previewWalk.getContext("2d")!;
  const startTime = performance.now();
  function previewFrame(now: number) {
    if (!running) return;
    const t = (now - startTime) / 1000;
    drawPreview(idleCtx, "idle", t);
    drawPreview(walkCtx, "walk", t);
    requestAnimationFrame(previewFrame);
  }
  function drawPreview(ctx: CanvasRenderingContext2D, state: AnimState, t: number) {
    ctx.clearRect(0, 0, previewIdle.width, previewIdle.height);
    ctx.imageSmoothingEnabled = false;
    drawPlayer(ctx, grid, poseFor(state, t), 6, 6, PREVIEW_SCALE, false);
  }
  requestAnimationFrame(previewFrame);

  // Tastatur: Escape schließt
  function onKey(e: KeyboardEvent) {
    if (e.key === "Escape") onClose();
    e.stopPropagation();
  }
  window.addEventListener("keydown", onKey, true);

  draw();
  refreshTools();

  return () => {
    running = false;
    window.removeEventListener("keydown", onKey, true);
    overlay.remove();
  };
}

// Hilfsfunktionen für DOM-Elemente

function el(tag: string, style: Partial<CSSStyleDeclaration>): HTMLDivElement {
  const node = document.createElement(tag) as HTMLDivElement;
  Object.assign(node.style, style);
  return node;
}

function button(label: string, onClick: () => void): HTMLButtonElement {
  const b = document.createElement("button");
  b.textContent = label;
  Object.assign(b.style, {
    background: "#3d3633",
    color: "#fff",
    border: "1px solid #5a514d",
    borderRadius: "4px",
    padding: "6px 10px",
    cursor: "pointer",
    fontSize: "13px",
  });
  b.addEventListener("click", onClick);
  return b;
}
