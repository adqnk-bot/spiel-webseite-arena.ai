"use client";

import { useEffect, useRef } from "react";
import { startGame } from "../game/client/game";

/** Hält das Spiel. Der Canvas entsteht erst im Browser, nicht beim Server-Rendern. */
export default function GameView() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ref.current) return;
    const handle = startGame({ container: ref.current });
    return () => handle.dispose();
  }, []);

  return <div id="game-root" ref={ref} />;
}
