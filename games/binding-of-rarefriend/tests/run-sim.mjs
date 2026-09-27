// Headless engine check: a bot plays full runs (no DOM, no network). Run: node games/binding-of-rarefriend/tests/run-sim.mjs
import assert from "node:assert/strict";
import { build } from "esbuild";
import { resolve } from "node:path";
const out = resolve("games/binding-of-rarefriend/.artifacts/sim.mjs");
await build({ entryPoints: ["games/binding-of-rarefriend/tests/sim.ts"], bundle: true, platform: "node", format: "esm", outfile: out, logLevel: "error" });
const { run, SIGNATURES, signatureFor, generationBonus } = await import(out);

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
assert.equal(generationBonus(1).text, "+1 heart");

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
    if (r.log.some(l => l.startsWith("STUCK")) || (god && r.status !== "won")) { problems++; console.log("PROBLEM", { family, god, seed, fams, options, status: r.status, depth: r.depth, t: r.time.toFixed(0), last: r.log.slice(-3) }); }
  }
}
const summarize = list => ({ runs: list.length, won: list.filter(r => r.status === "won").length, dead: list.filter(r => r.status === "dead").length,
  avgDepthReached: (list.reduce((a, r) => a + r.depth + 1, 0) / list.length).toFixed(2), avgTime: (list.reduce((a, r) => a + r.time, 0) / list.length).toFixed(0),
  avgKills: (list.reduce((a, r) => a + r.kills, 0) / list.length).toFixed(1) });
console.log("invulnerable bot:", JSON.stringify(summarize(results.god)));
console.log("normal bot:", JSON.stringify(summarize(results.normal)));

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
if (problems) { console.log(`${problems} problem run(s)`); process.exit(1); }
console.log("ok");
