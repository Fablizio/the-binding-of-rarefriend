/** Isaac-style floor layout: a grid of single-screen rooms joined by doors. */
import type { Rng } from "./rng";

export const COLS = 13, ROWS = 7;
export const GRID = 9;
export type Dir = "up" | "down" | "left" | "right";
export const DIRS: readonly Dir[] = ["up", "down", "left", "right"];
export const STEP: Readonly<Record<Dir, readonly [number, number]>> = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
export const OPPOSITE: Readonly<Record<Dir, Dir>> = { up: "down", down: "up", left: "right", right: "left" };

export type RoomKind = "start" | "normal" | "treasure" | "boss" | "shop" | "pain";
/** 0 floor, 1 rock (blocks walkers and shots), 2 pit (blocks walkers only). */
export type Tile = 0 | 1 | 2;
export type Room = {
  gx: number; gy: number; kind: RoomKind;
  doors: Partial<Record<Dir, true>>;
  tiles: Tile[][];
  visited: boolean; seen: boolean; cleared: boolean;
  distance: number;
  /** The floor's elite room: one normal room far from the start holds the floor's special Friend. */
  special: boolean;
  /** Needs a key to enter (treasure room and shop from floor 2 on). Unlocked for good once opened. */
  locked: boolean;
  /** Room of Pain contents, set by the floor's seeded RNG: a tougher fight or a reward room. */
  pain: "fight" | "reward" | null;
};
export type Floor = { rooms: Map<string, Room>; start: Room; boss: Room; treasure: Room | null; special: Room | null; shop: Room | null; painRoom: Room | null };
export const key = (gx: number, gy: number) => `${gx},${gy}`;

// Templates: R rock, P pit. Door approaches are forced clear and every layout is checked for connectivity.
const LAYOUTS = [
  [".............", ".............", ".............", ".............", ".............", ".............", "............."],
  [".............", ".R.........R.", ".............", ".............", ".............", ".R.........R.", "............."],
  [".............", "...R.....R...", "...R.....R...", ".............", "...R.....R...", "...R.....R...", "............."],
  [".............", ".............", "....RR.RR....", "....R...R....", "....RR.RR....", ".............", "............."],
  [".............", "..PPP...PPP..", "..P.......P..", ".............", "..P.......P..", "..PPP...PPP..", "............."],
  [".............", ".....P.P.....", "....PP.PP....", "...PP...PP...", "....PP.PP....", ".....P.P.....", "............."],
  ["RR.........RR", "R...........R", ".............", ".............", ".............", "R...........R", "RR.........RR"],
  [".............", ".RR.RR.RR.RR.", ".............", ".............", ".............", ".RR.RR.RR.RR.", "............."],
  [".............", "..R.......R..", ".R.R.....R.R.", ".............", ".R.R.....R.R.", "..R.......R..", "............."],
  [".............", ".............", "..RRRR.RRRR..", ".............", "..RRRR.RRRR..", ".............", "............."],
  [".....P.P.....", ".....P.P.....", ".....P.P.....", ".............", ".....P.P.....", ".....P.P.....", ".....P.P....."],
  [".............", ".P.P.P.P.P.P.", ".............", ".P.P.P.P.P.P.", ".............", ".P.P.P.P.P.P.", "............."],
  ["R...........R", ".............", "...PPP.PPP...", "...P.....P...", "...PPP.PPP...", ".............", "R...........R"],
  // Asymmetric rooms.
  [".............", ".RR..........", "...RR........", ".....R...PP..", "......RR..P..", "........RR...", "............."],
  [".............", ".PPPP........", ".P......RR...", ".P......R....", ".............", "......PPPPP..", "............."],
  [".............", "........RRR..", "..PP....RRR..", "..PP.........", ".............", "...RR...PPP..", "............."],
  [".............", "..R...R...R..", "...R...R...R.", ".............", ".R...R...R...", "..R...R...R..", "............."],
  // Lanes and stepping stones.
  [".............", "..R..R.R..R..", "..R..R.R..R..", ".............", "..R..R.R..R..", "..R..R.R..R..", "............."],
  [".............", ".PP.PP.PP.PP.", ".............", "PP.PP...PP.PP", ".............", ".PP.PP.PP.PP.", "............."],
  // Arenas: a wide open middle for the bigger fights.
  [".............", "..RRR...RRR..", "..R.......R..", ".............", "..R.......R..", "..RRR...RRR..", "............."],
  [".............", "....PP.PP....", "...P.....P...", ".............", "...P.....P...", "....PP.PP....", "............."],
  ["PP.........PP", "P...........P", ".............", ".............", ".............", "P...........P", "PP.........PP"],
] as const;
/** Arena layouts (indices into LAYOUTS) used for the elite room. */
const ARENAS = [LAYOUTS.length - 3, LAYOUTS.length - 2, LAYOUTS.length - 1, 6];

/** One extra layout per family, added to that family's floors (weighted double). */
const THEMED: Readonly<Record<number, readonly string[]>> = {
  0: [".............", "..R.R.R.R.R..", "..R.R...R.R..", ".............", "..R.R...R.R..", "..R.R.R.R.R..", "............."], // ribcage
  1: [".............", "...RR...RR...", "...RR...RR...", ".............", "...P.....P...", "....PPPPP....", "............."], // a face
  2: [".............", ".............", "....RRRRR....", ".............", "....RRRRR....", ".............", "............."], // the dinner table
  3: [".............", "..PP.....PP..", ".P..P...P..P.", ".............", ".P..P...P..P.", "..PP.....PP..", "............."], // cells
  4: ["R............", ".R...........", "..R......PP..", "...R.........", "....R....PP..", ".....R.......", "............."], // a crooked line
  5: [".............", ".PPP.PPP.PPP.", ".P.........P.", ".............", ".P.........P.", ".PPP.PPP.PPP.", "............."], // open sky
  6: [".............", ".RR.......RR.", ".RR..RR...RR.", ".............", "...RR....RR..", "...RR....RR..", "............."], // boulders
  7: [".............", ".R...R.R...R.", "...R.....R...", ".............", "...R.....R...", ".R...R.R...R.", "............."], // crystal field
  8: ["P............", ".....P.......", "..P......P...", ".............", "........P..P.", "...P.........", "............P"], // void rifts
};

function parseLayout(rows: readonly string[], rng: Rng): Tile[][] {
  const flipX = rng.chance(0.5), flipY = rng.chance(0.5);
  return Array.from({ length: ROWS }, (_, y) => Array.from({ length: COLS }, (_, x) => {
    const c = rows[flipY ? ROWS - 1 - y : y][flipX ? COLS - 1 - x : x];
    return c === "R" ? 1 : c === "P" ? 2 : 0;
  }));
}

const DOOR_TILES: Readonly<Record<Dir, readonly [number, number][]>> = {
  up: [[6, 0], [6, 1]], down: [[6, 6], [6, 5]], left: [[0, 3], [1, 3]], right: [[12, 3], [11, 3]],
};

function connected(tiles: Tile[][], doors: Dir[]) {
  const [sx, sy] = [6, 3];
  if (tiles[sy][sx] !== 0) return false;
  const seen = new Set([key(sx, sy)]), queue: [number, number][] = [[sx, sy]];
  while (queue.length) {
    const [x, y] = queue.shift()!;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS || tiles[ny][nx] !== 0 || seen.has(key(nx, ny))) continue;
      seen.add(key(nx, ny)); queue.push([nx, ny]);
    }
  }
  const open = tiles.flat().filter(tile => tile === 0).length;
  return doors.every(door => seen.has(key(...DOOR_TILES[door][0]))) && seen.size === open;
}

function makeTiles(kind: RoomKind, doors: Dir[], rng: Rng, family: number, special = false): Tile[][] {
  if (kind !== "normal") return parseLayout(LAYOUTS[0], rng);
  const themed = THEMED[family];
  const pool: (readonly string[])[] = special ? ARENAS.map(index => LAYOUTS[index]) : [...LAYOUTS.slice(1), ...(themed ? [themed, themed] : [])];
  for (let attempt = 0; attempt < 8; attempt++) {
    const tiles = parseLayout(rng.pick(pool), rng);
    for (const door of DIRS) for (const [x, y] of DOOR_TILES[door]) tiles[y][x] = 0;
    tiles[3][6] = 0;
    if (connected(tiles, doors)) return tiles;
  }
  return parseLayout(LAYOUTS[0], rng);
}

/** Every layout, for tests: generic, arenas and the themed ones. */
export const ALL_LAYOUTS: readonly (readonly string[])[] = [...LAYOUTS, ...Object.values(THEMED)];
export function layoutConnected(rows: readonly string[], doors: Dir[] = [...DIRS]) {
  const tiles = rows.map(row => [...row].map(c => (c === "R" ? 1 : c === "P" ? 2 : 0) as Tile));
  for (const door of DIRS) for (const [x, y] of DOOR_TILES[door]) tiles[y][x] = 0;
  tiles[3][6] = 0;
  return connected(tiles, doors);
}

export function generateFloor(rng: Rng, depth: number, family = 0): Floor {
  const target = Math.min(7 + depth * 2, 14);
  for (let attempt = 0; attempt < 200; attempt++) {
    const cells = new Map<string, [number, number]>();
    const center = Math.floor(GRID / 2);
    cells.set(key(center, center), [center, center]);
    const queue: [number, number][] = [[center, center]];
    const neighbours = (x: number, y: number) => DIRS.filter(d => cells.has(key(x + STEP[d][0], y + STEP[d][1]))).length;
    let guard = 0;
    while (queue.length && cells.size < target && guard++ < 600) {
      const [x, y] = queue.shift()!;
      for (const d of rng.shuffle([...DIRS])) {
        const nx = x + STEP[d][0], ny = y + STEP[d][1];
        if (nx < 0 || ny < 0 || nx >= GRID || ny >= GRID || cells.has(key(nx, ny))) continue;
        if (cells.size >= target || neighbours(nx, ny) > 1 || rng.chance(0.45)) continue;
        cells.set(key(nx, ny), [nx, ny]); queue.push([nx, ny]);
      }
      if (!queue.length && cells.size < target) queue.push(rng.pick([...cells.values()]));
    }
    if (cells.size < target) continue;
    // Distances from the start room.
    const distance = new Map([[key(center, center), 0]]);
    const bfs: [number, number][] = [[center, center]];
    while (bfs.length) {
      const [x, y] = bfs.shift()!;
      for (const d of DIRS) {
        const k = key(x + STEP[d][0], y + STEP[d][1]);
        if (cells.has(k) && !distance.has(k)) { distance.set(k, distance.get(key(x, y))! + 1); bfs.push(cells.get(k)!); }
      }
    }
    const deadEnds = [...cells.values()].filter(([x, y]) => (x !== center || y !== center) && neighbours(x, y) === 1)
      .sort((a, b) => distance.get(key(...b))! - distance.get(key(...a))!);
    if (deadEnds.length < 2 || distance.get(key(...deadEnds[0]))! < 3) continue;
    const bossCell = deadEnds[0], treasureCell = deadEnds[1];
    // The shop and the Room of Pain are extra dead ends grown off a fight room (never the boss or treasure
    // room), so neither ever sits on the way to the boss and the fight count stays the same.
    const leaf = () => {
      const options: [number, number, number][] = [];
      for (const [x, y] of cells.values()) {
        const k = key(x, y);
        if (k === key(...bossCell) || k === key(...treasureCell) || extra.has(k)) continue;
        for (const d of DIRS) {
          const nx = x + STEP[d][0], ny = y + STEP[d][1];
          if (nx < 0 || ny < 0 || nx >= GRID || ny >= GRID || cells.has(key(nx, ny)) || neighbours(nx, ny) !== 1) continue;
          options.push([nx, ny, k === key(center, center) ? 1 : 0]);
        }
      }
      const fights = options.filter(option => option[2] === 0);
      const pool = fights.length ? fights : options;
      if (!pool.length) return null;
      const [nx, ny] = rng.pick(pool);
      const parent = DIRS.map(d => key(nx - STEP[d][0], ny - STEP[d][1])).find(k => cells.has(k))!;
      cells.set(key(nx, ny), [nx, ny]); distance.set(key(nx, ny), distance.get(parent)! + 1);
      return key(nx, ny);
    };
    const extra = new Set<string>();
    const shopKey = leaf();
    if (shopKey) extra.add(shopKey);
    const painKey = leaf();
    if (!shopKey || !painKey) continue;
    const painKind: "fight" | "reward" = rng.chance(0.5) ? "fight" : "reward";
    const rooms = new Map<string, Room>();
    for (const [x, y] of cells.values()) {
      const k = key(x, y);
      const kind: RoomKind = k === key(center, center) ? "start" : k === key(...bossCell) ? "boss" : k === key(...treasureCell) ? "treasure"
        : k === shopKey ? "shop" : k === painKey ? "pain" : "normal";
      const doors = DIRS.filter(d => cells.has(key(x + STEP[d][0], y + STEP[d][1])));
      const pain = kind === "pain" ? painKind : null;
      rooms.set(k, {
        gx: x, gy: y, kind, doors: Object.fromEntries(doors.map(d => [d, true])),
        tiles: pain === "fight" ? makeTiles("normal", doors, rng, family, true) : makeTiles(kind, doors, rng, family),
        visited: false, seen: false, cleared: kind !== "normal" && kind !== "boss" && pain !== "fight",
        distance: distance.get(k)!, special: false,
        locked: depth >= 1 && (kind === "treasure" || kind === "shop"), pain,
      });
    }
    // The elite room: the normal room farthest from the start (ties broken at random), in an arena layout.
    const normals = rng.shuffle([...rooms.values()].filter(room => room.kind === "normal")).sort((a, b) => b.distance - a.distance);
    const special = normals[0] ?? null;
    if (special) {
      special.special = true;
      special.tiles = makeTiles("normal", DIRS.filter(d => special.doors[d]), rng, family, true);
    }
    return { rooms, start: rooms.get(key(center, center))!, boss: rooms.get(key(...bossCell))!, treasure: rooms.get(key(...treasureCell)) ?? null, special,
      shop: rooms.get(shopKey) ?? null, painRoom: rooms.get(painKey) ?? null };
  }
  throw new Error("Could not generate a floor.");
}
