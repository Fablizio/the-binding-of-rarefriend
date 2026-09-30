// Headless engine check: a bot plays full runs (no DOM, no network). Run: node games/binding-of-rarefriend/tests/run-sim.mjs
import { decodeGenerationSprites, type GenerationSprites } from "../../../src/generation-sprites";
import { sampleFriendSprites } from "../../../examples/fishing/sample-sprites";
import { Game, CX, CY, DOOR_POS, IN_X, IN_Y, TILE, type GameOptions, type Input } from "../engine/game";
import { COLS, ROWS, STEP, OPPOSITE, key, type Dir, type Room } from "../engine/dungeon";
import type { Roster } from "../engine/roster";
import type { FamilyId } from "../engine/themes";
export { SIGNATURES, signatureFor, generationBonus } from "../engine/signatures";
export { ALL_LAYOUTS, layoutConnected, generateFloor } from "../engine/dungeon";
export { createRng } from "../engine/rng";

const base = [sampleFriendSprites(7730n)!, sampleFriendSprites(3412n)!];
export const fakeSprites = (id: number, family: number): GenerationSprites => decodeGenerationSprites(BigInt(id), family, id, base[id % 2].frames);

export function fakeRoster(families: FamilyId[]): Roster {
  let id = 100;
  return { sampled: 0, floors: families.map(family => ({ family, boss: fakeSprites(id++, family), regulars: [0, 1, 2, 3, 4].map(() => fakeSprites(id++, family)) })) };
}

function tilePath(game: Game, from: { x: number; y: number }, to: { x: number; y: number }, flying: boolean) {
  const t = (p: { x: number; y: number }) => [Math.max(0, Math.min(COLS - 1, Math.floor((p.x - IN_X) / TILE))), Math.max(0, Math.min(ROWS - 1, Math.floor((p.y - IN_Y) / TILE)))];
  const [sx, sy] = t(from), [ex, ey] = t(to);
  const prev = new Map<string, string | null>([[key(sx, sy), null]]), q = [[sx, sy]];
  while (q.length) {
    const [x, y] = q.shift()!;
    if (x === ex && y === ey) break;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS || prev.has(key(nx, ny))) continue;
      const tile = game.room.tiles[ny][nx];
      if (tile === 1 || (tile === 2 && !flying)) continue;
      prev.set(key(nx, ny), key(x, y)); q.push([nx, ny]);
    }
  }
  let cur: string | null = key(ex, ey); const path: string[] = [];
  while (cur && cur !== key(sx, sy)) { path.unshift(cur); cur = prev.get(cur) ?? null; if (!prev.has(path[0])) return null; }
  const next = path[0];
  if (!next) return to;
  const [nx, ny] = next.split(",").map(Number);
  // Step to the next tile's centre, then go straight for the goal once inside its tile: a goal near a pit's
  // edge is unreachable in a straight line from a neighbouring tile.
  return { x: IN_X + nx * TILE + TILE / 2, y: IN_Y + ny * TILE + TILE / 2 };
}

function nextDoor(game: Game): Dir | null {
  // BFS over rooms to the nearest unvisited (or boss when all visited) room.
  const start = game.room, prev = new Map<Room, [Room, Dir] | null>([[start, null]]), q = [start];
  let goal: Room | null = null;
  while (q.length) {
    const r = q.shift()!;
    if (r !== start && !r.visited) { goal = r; break; }
    for (const d of Object.keys(r.doors) as Dir[]) {
      const n = game.floor.rooms.get(key(r.gx + STEP[d][0], r.gy + STEP[d][1]))!;
      // Locked rooms only with a key in hand; the Room of Pain only with at least two hearts to pay the toll.
      if (n.locked && game.keys <= 0) continue;
      if (n.kind === "pain" && !n.visited && game.player.hp < 4) continue;
      if (!prev.has(n)) { prev.set(n, [r, d]); q.push(n); }
    }
  }
  if (!goal) goal = game.floor.boss === start ? null : game.floor.boss;
  if (!goal) return null;
  let cur = goal, dir: Dir | null = null;
  while (prev.get(cur)) { const [p, d] = prev.get(cur)!; dir = d; cur = p; }
  return dir;
}

/** Rocks (not pits) stop shots: walk around them when one sits between the bot and its target. */
function clearShot(game: Game, from: { x: number; y: number }, to: { x: number; y: number }) {
  const steps = Math.ceil(Math.hypot(to.x - from.x, to.y - from.y) / 10);
  for (let i = 1; i < steps; i++) {
    const x = from.x + (to.x - from.x) * i / steps, y = from.y + (to.y - from.y) * i / steps;
    const tx = Math.floor((x - IN_X) / TILE), ty = Math.floor((y - IN_Y) / TILE);
    if (game.room.tiles[ty]?.[tx] === 1) return false;
  }
  return true;
}

export function botInput(game: Game, input: Input) {
    const p = game.player, enemies = game.state.enemies.filter(e => e.alpha > 0.5);
    input.move = null; input.aim = null;
    let target: { x: number; y: number } | null = null;
    if (enemies.length) {
      const e = enemies.sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y))[0];
      const dx = e.x - p.x, dy = e.y - e.r - (p.y - 24), l = Math.hypot(dx, dy);
      input.aim = { x: dx / l, y: dy / l };
      // keep medium distance
      const d = Math.hypot(e.x - p.x, e.y - p.y);
      target = d > 200 || !clearShot(game, { x: p.x, y: p.y - 4 }, e) ? e : d < 130 ? { x: p.x - (e.x - p.x), y: p.y - (e.y - p.y) } : null;
      if (target) target = { x: Math.max(IN_X + 20, Math.min(IN_X + 700, target.x)), y: Math.max(IN_Y + 20, Math.min(IN_Y + 370, target.y)) };
    } else {
      const ped = game.state.pedestal;
      const lockedLeft = [...game.floor.rooms.values()].some(r => r.locked && !r.visited);
      const pick = game.state.pickups.find(x => x.kind === "spark" || x.kind === "coin" || x.kind === "key" || x.kind === "chest" || (x.kind === "lockedChest" && game.keys > 0));
      // In a shop, buy what helps and is affordable: a relic, a heart container, a key for a locked room, a heart when hurt.
      const hurt = game.player.hp <= game.stats.maxHp - 2;
      const want = game.state.shop.filter(item => !item.sold && item.price <= game.coins
        && (item.kind === "relic" || (item.kind === "key" && lockedLeft) || ((item.kind === "heart" || item.kind === "half") && hurt)));
      const heal = game.room.kind === "pain" && game.player.hp <= 1 ? game.state.pickups.find(x => x.kind === "heart" || x.kind === "half") : undefined;
      if (heal) target = heal;
      else if (ped && !ped.taken) target = ped;
      else if (pick) target = pick;
      else if (want.length) target = want[0];
      else if (game.state.trapdoor) target = { x: CX, y: CY };
      else {
        const d = nextDoor(game);
        if (d) { const [x, y] = DOOR_POS[d]; target = { x: x + STEP[d][0] * 40, y: y + STEP[d][1] * 40 }; }
      }
    }
    if (target) {
      const way = tilePath(game, p, target, game.stats.flying) ?? target;
      const dx = way.x - p.x, dy = way.y - p.y, l = Math.hypot(dx, dy);
      if (l > 3) input.move = { x: dx / l, y: dy / l };
    }
    return enemies;
}

export function run(seed: number, family: FamilyId, families: FamilyId[], god: boolean, onTick?: (game: Game, t: number) => boolean | void, options: GameOptions = {}) {
  const game = new Game(fakeSprites(7730, family), family, fakeRoster(families), seed, options);
  const input: Input = { keys: new Set(), move: null, aim: null };
  const dt = 1 / 60;
  let t = 0, stuck = 0, last = { x: 0, y: 0 }, lastRoom = game.room, roomTime = 0;
  const log: string[] = [];
  const keyChecked = new Set<number>();
  const visits = { shop: 0, pain: 0, treasure: 0, lockedTreasure: 0 };
  while (game.status === "playing" && t < 60 * 40) {
    t += dt; roomTime += dt;
    if (game.room !== lastRoom) { lastRoom = game.room; roomTime = 0; }
    if (god) game.player.invuln = 1;
    const enemies = botInput(game, input);
    const p = game.player;
    game.update(dt, input);
    if (game.room !== lastRoom && game.room.visited) {
      const kind = game.room.kind;
      if (kind === "shop" || kind === "pain" || kind === "treasure") visits[kind]++;
      if (kind === "treasure" && game.depth >= 1) visits.lockedTreasure++;
    }
    // From floor 2 on, the first cleared fight room must have dropped a key (unless one dropped earlier on the floor).
    if (game.depth >= 1 && !keyChecked.has(game.depth) && [...game.floor.rooms.values()].some(r => r.kind === "normal" && r.cleared)) {
      keyChecked.add(game.depth);
      if (game.floorKeyDrops < 1) log.push(`KEYFAIL floor ${game.depth + 1}`);
    }
    if (onTick && onTick(game, t)) break;
    for (const ev of game.drainEvents()) if (ev.type === "floor" || ev.type === "boss" || ev.type === "toast") log.push(`${t.toFixed(0)}s ${ev.type}${"title" in ev ? " " + ev.title : ""}`);
    if (Math.hypot(p.x - last.x, p.y - last.y) < 0.01 && !enemies.length) stuck += dt; else stuck = 0;
    last = { x: p.x, y: p.y };
    if (stuck > 8 || roomTime > 120) { log.push(`STUCK in ${game.room.kind} room at ${p.x.toFixed(0)},${p.y.toFixed(0)} enemies=${game.state.enemies.map(e => `${e.kind}:${e.state}:a${e.alpha.toFixed(1)}:hp${e.hp.toFixed(1)}@${e.x.toFixed(0)},${e.y.toFixed(0)}`).join(' ')}`); break; }
  }
  return { status: game.status, depth: game.depth, time: t, kills: game.kills, defeated: game.defeated.length, hp: game.player.hp, relics: game.relics,
    coins: game.coinsCollected, keys: game.keysCollected, unlocks: game.unlocks, chests: game.chestsOpened, bought: game.bought, pain: game.painCrossings, visits,
    signature: game.signature.id, generation: game.genBonus?.generation ?? null, endRoom: game.deathCause === "pain" ? "pain toll" : game.room.special ? "elite" : game.room.kind, log };
}

/** Pain tolls: half a heart in, half a heart out, paid in full (never a hit); at half a heart the toll kills. */
export function painCheck() {
  const game = new Game(fakeSprites(7730, 0), 0, fakeRoster([0, 1, 2, 3]), 99);
  game.reducedMotion = true;
  const input: Input = { keys: new Set(), move: null, aim: null };
  const pain = game.floor.painRoom!;
  const door = (Object.keys(pain.doors) as Dir[])[0];
  const results: { hp: number; invuln: number; status: string; room: string; cause: string | null }[] = [];
  const cross = (room: Room, from: Dir, hp: number) => {
    game.player.hp = hp; game.player.invuln = 0;
    game.pendingRoom = { room, from };
    game.update(1 / 60, input);
    results.push({ hp: game.player.hp, invuln: game.player.invuln, status: game.status, room: game.room.kind, cause: game.deathCause });
  };
  const parent = game.floor.rooms.get(key(pain.gx + STEP[door][0], pain.gy + STEP[door][1]))!;
  cross(pain, door, 6);             // in: 6 -> 5
  cross(parent, OPPOSITE[door], 5); // out: 5 -> 4
  cross(pain, door, 3);             // in with 1½ hearts: 3 -> 2
  game.player.hp = 1;               // a hit inside leaves half a heart
  const warned = (Object.keys(game.room.doors) as Dir[]).every(d => game.lethalToll(d));
  cross(parent, OPPOSITE[door], 1); // out at half a heart: the toll kills
  return { results, crossings: game.painCrossings, warned };
}
