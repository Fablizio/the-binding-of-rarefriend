// Headless engine check: a bot plays full runs (no DOM, no network). Run: node games/binding-of-rarefriend/tests/run-sim.mjs
import assert from "node:assert/strict";
import { build } from "esbuild";
import { resolve } from "node:path";
const out = resolve("games/binding-of-rarefriend/.artifacts/sim.mjs");
await build({ entryPoints: ["games/binding-of-rarefriend/tests/sim.ts"], bundle: true, platform: "node", format: "esm", outfile: out, logLevel: "error" });
const { run, SIGNATURES, signatureFor, generationBonus, ALL_LAYOUTS, layoutConnected, generateFloor, createRng, painCheck } = await import(out);

// Every room layout is 13×7 and fully connected with all four doors open.
ALL_LAYOUTS.forEach((layout, i) => {
  assert(layout.length === 7 && layout.every(row => row.length === 13), `layout ${i} size`);
  assert(layoutConnected(layout), `layout ${i} is not connected: ${layout.join("|")}`);
});
// Every floor has an elite room, never the start, boss or treasure room.
let fallback = 0, normals = 0;
for (let s = 0; s < 300; s++) {
  const floor = generateFloor(createRng(s), s % 4, s % 9);
  assert(floor.special && floor.special.kind === "normal", `floor ${s} has no elite room`);
  for (const room of floor.rooms.values()) if (room.kind === "normal") { normals++; if (room.tiles.flat().every(t => t === 0)) fallback++; }
}
console.log(`layouts: ${ALL_LAYOUTS.length} connected; 300 floors each have an elite room; empty-room fallbacks ${fallback}/${normals}`);

// Shops, Rooms of Pain and locks: every floor has one shop and one Room of Pain, every room is connected,
// the boss is reachable without keys (and without the Room of Pain), and locks appear from floor 2 on only.
const STEPS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
const reach = (floor, pass) => {
  const seen = new Set([floor.start]), q = [floor.start];
  while (q.length) {
    const r = q.shift();
    for (const d of Object.keys(r.doors)) {
      const n = floor.rooms.get(`${r.gx + STEPS[d][0]},${r.gy + STEPS[d][1]}`);
      assert(n && n.doors[{ up: "down", down: "up", left: "right", right: "left" }[d]], "doors must be two-way");
      if (!seen.has(n) && pass(n)) { seen.add(n); q.push(n); }
    }
  }
  return seen;
};
const painKinds = { fight: 0, reward: 0 };
for (let s = 0; s < 400; s++) {
  const depth = s % 4, floor = generateFloor(createRng(s), depth, s % 9);
  const rooms = [...floor.rooms.values()];
  const count = kind => rooms.filter(r => r.kind === kind).length;
  assert(count("shop") === 1 && count("pain") === 1 && count("treasure") === 1 && count("boss") === 1, `floor ${s}: one shop, pain, treasure and boss room`);
  assert.equal(reach(floor, () => true).size, rooms.length, `floor ${s}: every room connected`);
  const free = reach(floor, r => !r.locked && r.kind !== "pain" && r.kind !== "shop" && r.kind !== "treasure");
  assert(free.has(floor.boss), `floor ${s}: boss reachable without keys or pain`);
  for (const r of rooms) {
    if (["shop", "pain", "treasure", "boss"].includes(r.kind)) assert.equal(Object.keys(r.doors).length, 1, `floor ${s}: ${r.kind} is a dead end`);
    assert.equal(r.locked, depth >= 1 && (r.kind === "shop" || r.kind === "treasure"), `floor ${s}: lock rule for ${r.kind}`);
  }
  // Special rooms hang off fight rooms (or the start), never off each other or the boss.
  for (const r of [floor.shop, floor.painRoom]) {
    const d = Object.keys(r.doors)[0], parent = floor.rooms.get(`${r.gx + STEPS[d][0]},${r.gy + STEPS[d][1]}`);
    assert(parent.kind === "normal" || parent.kind === "start", `floor ${s}: ${r.kind} parent is ${parent.kind}`);
  }
  painKinds[floor.painRoom.pain]++;
  const again = generateFloor(createRng(s), depth, s % 9);
  assert.equal(JSON.stringify([...again.rooms.values()].map(r => [r.gx, r.gy, r.kind, r.pain, r.tiles])), JSON.stringify(rooms.map(r => [r.gx, r.gy, r.kind, r.pain, r.tiles])), `floor ${s}: deterministic per seed`);
}
console.log(`400 floors: one shop + one Room of Pain each (${painKinds.fight} fight, ${painKinds.reward} reward), all rooms connected, boss reachable without keys, locks only from floor 2, deterministic`);
const tolls = painCheck();
assert.deepEqual(tolls.results.map(r => r.hp), [5, 4, 1, 1, 1], "pain tolls: half a heart each way, never below half a heart");
assert(tolls.results.every(r => r.status === "playing" && r.invuln === 0), "pain tolls never kill and are not hits");
console.log("pain tolls:", JSON.stringify(tolls.results.map(r => `${r.room}:${r.hp}`)));

// Signatures are deterministic per Friend and spread evenly over token IDs and seeds.
const counts = Object.fromEntries(SIGNATURES.map(s => [s.id, 0]));
for (let id = 1; id <= 20000; id++) {
  const seed = (id * 2654435761) >>> 0;
  const a = signatureFor({ tokenId: BigInt(id), seed }), b = signatureFor({ tokenId: BigInt(id), seed });
  assert.equal(a.id, b.id, "signature must be deterministic");
  counts[a.id]++;
}
for (const [id, n] of Object.entries(counts)) assert(n > 20000 * 0.09 && n < 20000 * 0.16, `signature ${id} share ${n}`);
console.log("signature spread over 20000 IDs:", JSON.stringify(counts));
assert.equal(generationBonus(null), null); assert.equal(generationBonus(0), null);
assert.equal(generationBonus(1).tier, "Legendary"); assert.equal(generationBonus(1).text, "+1 heart, +15% dmg, +10% fire rate");
assert.deepEqual([1, 2, 3, 4, 5, 6, 9].map(g => generationBonus(g).tier), ["Legendary", "Epic", "Rare", "Uncommon", "Common", "Standard", "Standard"]);
for (let g = 1; g < 6; g++) {
  const a = generationBonus(g), b = generationBonus(g + 1);
  const power = x => (1 + x.hearts * 0.1) * x.damage * x.fireRate;
  assert(a.hearts >= b.hearts && a.damage >= b.damage && power(a) > power(b), `generation ${g} must be stronger than ${g + 1}`);
}

const results = { god: [], normal: [] };
let n = 0, problems = 0;
for (let family = 0; family < 9; family++) for (const god of [true, false]) {
  const others = [0,1,2,3,4,5,6,7,8].filter(f => f !== family);
  for (let s = 0; s < 3; s++) {
    const seed = 1000 + n;
    const options = { signature: SIGNATURES[n % SIGNATURES.length].id, generation: n % 7 === 6 ? null : 1 + (n % 7) };
    n++;
    const fams = [family, others[(s * 3) % 8], others[(s * 3 + 1) % 8], others[(s * 3 + 2) % 8]];
    const r = run(seed, family, fams, god, undefined, options);
    (god ? results.god : results.normal).push(r);
    if (r.log.some(l => /^(STUCK|PAINKILL|KEYFAIL)/.test(l)) || (god && r.status !== "won")) { problems++; console.log("PROBLEM", { family, god, seed, fams, options, status: r.status, depth: r.depth, t: r.time.toFixed(0), last: r.log.slice(-3) }); }
  }
}
const summarize = list => ({ runs: list.length, won: list.filter(r => r.status === "won").length, dead: list.filter(r => r.status === "dead").length,
  avgDepthReached: (list.reduce((a, r) => a + r.depth + 1, 0) / list.length).toFixed(2), avgTime: (list.reduce((a, r) => a + r.time, 0) / list.length).toFixed(0),
  avgKills: (list.reduce((a, r) => a + r.kills, 0) / list.length).toFixed(1) });
const loot = list => {
  const sum = f => list.reduce((a, r) => a + f(r), 0), floors = sum(r => r.depth + 1);
  return { perFloor: { coins: (sum(r => r.coins) / floors).toFixed(1), keys: (sum(r => r.keys) / floors).toFixed(2), chests: (sum(r => r.chests) / floors).toFixed(2) },
    unlocks: sum(r => r.unlocks), bought: sum(r => r.bought), shopVisits: sum(r => r.visits.shop), painVisits: sum(r => r.visits.pain), painTolls: sum(r => r.pain),
    treasureVisits: sum(r => r.visits.treasure), lockedTreasureVisits: sum(r => r.visits.lockedTreasure) };
};
console.log("invulnerable bot:", JSON.stringify(summarize(results.god)));
console.log("normal bot:", JSON.stringify(summarize(results.normal)));
console.log("invulnerable bot loot:", JSON.stringify(loot(results.god)));
console.log("normal bot loot:", JSON.stringify(loot(results.normal)));
const where = {}; for (const r of results.normal) if (r.status === "dead") where[r.endRoom] = (where[r.endRoom] ?? 0) + 1;
console.log("normal bot deaths by room:", JSON.stringify(where));

// Balance: the same nine normal runs (one per family, no generation bonus) with each signature.
console.log("normal bot by signature (9 runs each, same seeds):");
for (const signature of SIGNATURES) {
  const list = [];
  for (let family = 0; family < 9; family++) {
    const fams = [family, (family + 1) % 9, (family + 4) % 9, (family + 7) % 9];
    const r = run(5000 + family, family, fams, false, undefined, { signature: signature.id, generation: null });
    if (r.log.some(l => l.startsWith("STUCK"))) { problems++; console.log("PROBLEM", { family, signature: signature.id, last: r.log.slice(-2) }); }
    list.push(r);
  }
  const s = summarize(list);
  console.log(`  ${signature.name.padEnd(13)} won ${s.won}/9 · avg floor reached ${s.avgDepthReached} · avg kills ${s.avgKills} · avg ${s.avgTime}s`);
}
// Generation ladder: the same 18 normal runs (two signatures per family) as generation 1 vs generation 6.
const ladder = {};
for (const generation of [1, 6]) {
  const list = [];
  for (let family = 0; family < 9; family++) for (let k = 0; k < 2; k++) {
    const fams = [family, (family + 2) % 9, (family + 5) % 9, (family + 8) % 9];
    const r = run(7000 + family * 2 + k, family, fams, false, undefined, { signature: SIGNATURES[(family + k * 4) % SIGNATURES.length].id, generation });
    if (r.log.some(l => l.startsWith("STUCK"))) { problems++; console.log("PROBLEM", { family, generation, last: r.log.slice(-2) }); }
    list.push(r);
  }
  ladder[generation] = summarize(list);
  console.log(`  generation ${generation}: won ${ladder[generation].won}/${list.length} · avg floor reached ${ladder[generation].avgDepthReached} · avg kills ${ladder[generation].avgKills}`);
}
if (problems) { console.log(`${problems} problem run(s)`); process.exit(1); }
console.log("ok");
