import { run } from "./sim";
import { render } from "../engine/render";
import type { FamilyId } from "../engine/themes";
declare global { interface Window { shots: string[]; } }
const canvas = document.createElement("canvas"); canvas.width = 960; canvas.height = 640; document.body.append(canvas);
const ctx = canvas.getContext("2d")!;
window.shots = [];
const fams: FamilyId[][] = [[0, 1, 2, 3], [4, 5, 6, 7], [8, 0, 3, 6]];
fams.forEach((floors, i) => {
  let lastDepth = -1, combat = false, boss = false;
  run(2000 + i, floors[0], floors, true, (game, t) => {
    const enemies = game.state.enemies.length;
    if (game.depth !== lastDepth) { lastDepth = game.depth; combat = false; boss = false; }
    const snap = (label: string) => { render(ctx, game, t * 1000); window.shots.push(label + "|" + canvas.toDataURL("image/png")); };
    if (!combat && enemies >= 3 && game.room.kind === "normal" && game.state.enemies.every(e => e.spawn <= 0) && game.tears.length > 3) { combat = true; snap(`run${i}-floor${game.depth + 1}-combat`); }
    if (!boss && game.boss && game.bossIntro <= 0 && game.tears.length > 8) { boss = true; snap(`run${i}-floor${game.depth + 1}-boss`); }
    return game.depth >= 2 && boss && combat;
  });
});
