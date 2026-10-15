# arena-seite

Ordner mit allem, was zum Erstellen der Spielseite auf arena.ai nötig ist. Next.js (App Router), TypeScript.

## Aufbau

- `src/app/` Seiten und API. `/` zeigt das Spiel, `/api/health` gibt `{ "ok": true }` zurück.
- `src/components/GameView.tsx` startet das Spiel im Browser (`startGame`) und räumt beim Verlassen auf.
- `src/game/` und `src/shared/` sind Kopien des Spielcodes aus dem Repository. Nicht von Hand ändern.
- `scripts/sync-game.sh` kopiert den Code aus `shared/` und `client/src/` in diesen Ordner.

## Befehle

```
npm install
npm run sync      # Spielcode aus dem Repository kopieren
npm run dev       # lokal starten
npm run build     # Produktionsbuild
```

## Spielstand

Der Spielstand liegt im Browser (IndexedDB), nicht auf dem Server. Der Server speichert keine Spieldaten.
