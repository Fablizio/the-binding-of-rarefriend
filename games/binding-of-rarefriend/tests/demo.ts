// Renders the README demo clip frame by frame: test sprites, a bot at the controls, fixed 1/60 s steps
// (test fixture only; never part of the game build). Run through tests/run-demo.mjs.
import { botInput, fakeRoster, fakeSprites } from "./sim";
import { Game, type Input } from "../engine/game";
import { render } from "../engine/render";
declare global { interface Window { saveFrame(index: number, data: string): Promise<void>; demo: Promise<string>; } }

const FPS = 15, STEP = 1 / 60, EVERY = 60 / FPS;
const canvas = document.createElement("canvas"); canvas.width = 960; canvas.height = 640; document.body.append(canvas);
const ctx = canvas.getContext("2d")!;
const game = new Game(fakeSprites(7730, 5), 5, fakeRoster([5, 7, 1, 6]), 4242, { signature: "chain", generation: 1 });
const input: Input = { keys: new Set(), move: null, aim: null };
let t = 0, tick = 0, frames = 0;

async function step(capture: boolean) {
  if (game.player.hp <= 2) game.player.hp = game.stats.maxHp; // keep the demo going
  botInput(game, input);
  game.update(STEP, input);
  game.drainEvents();
  t += STEP; tick++;
  if (capture && tick % EVERY === 0) { render(ctx, game, t * 1000); await window.saveFrame(frames++, canvas.toDataURL("image/png")); }
}

window.demo = (async () => {
  const log: string[] = [];
  // Segment 1: the floor-2 elite room (the elite Friend plus its escorts).
  while (!(game.depth >= 1 && game.room.special && game.special && game.special.spawn <= 0.2) && t < 900) await step(false);
  log.push(`elite fight from ${t.toFixed(1)}s, floor ${game.depth + 1}, ${game.state.enemies.length} enemies`);
  for (let i = 0; i < 60 * 7.5 && game.status === "playing"; i++) await step(true);
  // Segment 2: the floor's boss, after its intro.
  while (!(game.boss && game.bossIntro <= 0.2) && t < 1800 && game.status === "playing") await step(false);
  log.push(`boss from ${t.toFixed(1)}s, floor ${game.depth + 1}`);
  for (let i = 0; i < 60 * 6.5 && game.status === "playing"; i++) await step(true);
  log.push(`${frames} frames`);
  return log.join("; ");
})();
