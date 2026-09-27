// Automated browser check for The Binding of RareFriend (test fixtures only: mock wallet, mock RPC, sample art).
// Run from the SDK root: node games/binding-of-rarefriend/tests/browser.mjs [outdir]
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { chromium } from "playwright";
import { decodeFunctionData, encodeFunctionResult, parseAbi } from "viem";
import { buildGame, createGameServer } from "../../../scripts/dev-game.mjs";
import { installFixture } from "../../../scripts/browser-fixture.mjs";
import { FAMILIES_REGISTRY_ABI, GENERATION_SPRITE_MANIFEST } from "../../../dist/generation-sprites.js";

const MULTICALL = parseAbi([
  "struct Call3 { address target; bool allowFailure; bytes callData; }",
  "struct Result { bool success; bytes returnData; }",
  "function aggregate3(Call3[] calls) payable returns (Result[] returnData)",
]);
const source = await readFile(new URL("../../../examples/fishing/sample-sprites.ts", import.meta.url), "utf8");
const sample = id => [...source.split(`"${id}": decodeGenerationSprites`)[1].split("]),")[0].matchAll(/0x[0-9a-f]+n/g)].map(([w]) => BigInt(w.slice(0, -1)));
const FRAMES = [sample(7730), sample(3412)];

function registry(data) {
  const { functionName, args } = decodeFunctionData({ abi: FAMILIES_REGISTRY_ABI, data });
  let result;
  if (functionName === "familyOf") result = args[0] === 7730n ? 5 : Number(args[0] % 9n);
  else if (functionName === "seedOf") result = Number(args[0] % 4294967296n);
  else if (functionName === "frames") result = FRAMES[args[1] % 2];
  else throw new Error(`Unexpected artwork read ${functionName}`);
  return encodeFunctionResult({ abi: FAMILIES_REGISTRY_ABI, functionName, result });
}
const reads = { multicall: 0, registry: 0 };
function artworkCall(call) {
  const to = call.to.toLowerCase();
  if (to === GENERATION_SPRITE_MANIFEST.registry.toLowerCase()) { reads.registry++; return registry(call.data); }
  if (to === "0xca11bde05977b3631167028862be2a173976ca11") {
    reads.multicall++;
    const { args } = decodeFunctionData({ abi: MULTICALL, data: call.data });
    const out = args[0].map(c => {
      assert.equal(c.target.toLowerCase(), GENERATION_SPRITE_MANIFEST.registry.toLowerCase(), "Only the artwork registry is read");
      return { success: true, returnData: registry(c.callData) };
    });
    return encodeFunctionResult({ abi: MULTICALL, functionName: "aggregate3", result: out });
  }
  throw new Error(`Unexpected contract ${call.to}`);
}

const outdir = resolve(process.argv[2] ?? "games/binding-of-rarefriend/.artifacts");
await mkdir(outdir, { recursive: true });
const temporary = await mkdtemp(join(tmpdir(), "bor-test-"));
const build = await buildGame(resolve("games/binding-of-rarefriend"), { outdir: join(temporary, "dist") });
const server = createGameServer(build.outdir);
await new Promise(r => server.listen(0, "127.0.0.1", r));
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH || undefined });
const failures = [];
try {
  for (const view of [{ name: "desktop", width: 960, height: 800, touch: false }, { name: "phone-landscape", width: 844, height: 390, touch: true }, { name: "phone-portrait", width: 390, height: 844, touch: true }]) {
    const context = await browser.newContext({ viewport: { width: view.width, height: view.height }, hasTouch: view.touch, isMobile: view.touch });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", e => errors.push(e.message));
    page.on("console", m => { if (m.type() === "error") errors.push(m.text()); });
    const fixture = await installFixture(page, origin, { artworkCall });
    await page.goto(origin);
    await page.getByRole("button", { name: /^Connect (wallet|Browser wallet)$/ }).click();
    await page.getByRole("button", { name: /^Friend #7730\b/ }).click();
    const game = page.frameLocator("iframe");
    await game.getByRole("button", { name: /Enter the dungeon/ }).waitFor({ timeout: 20000 });
    await page.locator(".rf-game-frame").screenshot({ path: join(outdir, `${view.name}-title.png`) });
    await page.screenshot({ path: join(outdir, `${view.name}-page.png`) });
    await game.getByRole("button", { name: /Enter the dungeon/ }).click();
    await game.locator("canvas").waitFor();
    const frameHandle = page.frames().find(f => f !== page.mainFrame());
    await page.waitForTimeout(600);
    await page.locator(".rf-game-frame").screenshot({ path: join(outdir, `${view.name}-start.png`) });
    // Walk up through the start room's door using keys, shoot a bit.
    const canvas = game.locator("canvas");
    await canvas.focus();
    if (!view.touch) {
      await page.keyboard.down("ArrowUp"); await page.waitForTimeout(400); await page.keyboard.up("ArrowUp");
      for (const k of ["w", "d", "s", "a"]) { await page.keyboard.down(k); await page.waitForTimeout(250); await page.keyboard.up(k); }
    } else {
      const box = await canvas.boundingBox();
      await canvas.tap({ position: { x: box.width * 0.25, y: box.height * 0.5 } });
    }
    // Drive the game through test-only engine access: move the player into rooms to see enemies.
    await frameHandle.evaluate(() => new Promise(r => setTimeout(r, 300)));
    await page.locator(".rf-game-frame").screenshot({ path: join(outdir, `${view.name}-play.png`) });
    // Reach the engine through React's fiber, for this test only (no hook exists in the game build).
    const withGame = (fn, arg) => frameHandle.evaluate(`(() => {
      const canvas = document.querySelector("canvas");
      let fiber = canvas[Object.keys(canvas).find(k => k.startsWith("__reactFiber"))];
      while (fiber && typeof fiber.type !== "function") fiber = fiber.return;
      const game = fiber.memoizedState.next.memoizedState.current;
      if (!game) throw new Error("no running game");
      return (${fn})(game, ${JSON.stringify(arg ?? null)});
    })()`);
    // The floor's elite room: an arena layout, the elite Friend and its minimap pip.
    await withGame(game => { game.player.invuln = 99; game.pendingRoom = { room: game.floor.special, from: Object.keys(game.floor.special.doors)[0] }; });
    await page.waitForTimeout(900);
    const elite = await withGame(game => ({ special: game.room.special, elites: game.state.enemies.filter(e => e.special).length }));
    assert.deepEqual(elite, { special: true, elites: 1 }, `${view.name}: elite room`);
    await page.locator(".rf-game-frame").screenshot({ path: join(outdir, `${view.name}-elite.png`) });
    // Boss room: the VS card appears and the room stays frozen behind it until skipped.
    await withGame(game => { game.player.invuln = 99; game.pendingRoom = { room: game.floor.boss, from: Object.keys(game.floor.boss.doors)[0] }; });
    await game.locator(".bor-vs").waitFor({ timeout: 5000 });
    await page.waitForTimeout(500);
    await page.locator(".rf-game-frame").screenshot({ path: join(outdir, `${view.name}-vs.png`) });
    const frozen = await withGame(game => { const b = game.boss; return { x: b.x, y: b.y, intro: game.intro, time: game.time }; });
    await page.waitForTimeout(300);
    const later = await withGame(game => { const b = game.boss; return { x: b.x, y: b.y, intro: game.intro, time: game.time }; });
    assert(frozen.intro > 0 && later.x === frozen.x && later.y === frozen.y && later.time === frozen.time, `${view.name}: sim must freeze behind the VS card`);
    if (view.touch) await game.locator(".bor-vs").tap(); else await page.keyboard.press("x");
    await game.locator(".bor-vs").waitFor({ state: "detached", timeout: 3000 });
    await page.waitForTimeout(400);
    await page.locator(".rf-game-frame").screenshot({ path: join(outdir, `${view.name}-boss.png`) });
    // End screens.
    await withGame((game, { won }) => {
      for (const floor of game.roster.floors) for (const sprites of [...floor.regulars, floor.boss])
        game.defeated.push({ id: sprites.tokenId, family: sprites.familyId, sprites, boss: sprites === floor.boss });
      if (won) { game.depth = game.floors - 1; game.state.trapdoor = true; game.player.x = 480; game.player.y = 298; game.player.invuln = 99; }
      else { game.player.invuln = 0; game.hurtPlayer(99); }
    }, { won: view.name !== "phone-portrait" });
    await game.getByRole("button", { name: "Copy result" }).waitFor({ timeout: 5000 });
    await page.waitForTimeout(700);
    await page.locator(".rf-game-frame").screenshot({ path: join(outdir, `${view.name}-end.png`) });
    const shared = await game.getByRole("textbox", { name: /run result/ }).inputValue();
    assert.match(shared, /^Friend #7730 \(Hoverer, signature: [A-Za-z ]+\) (cleared 4 floors|reached floor \d of 4) and defeated \d+ real Rare Friends in \d+:\d\d — The Binding of RareFriend https:\/\/fablizio\.github\.io\/the-binding-of-rarefriend\/$/);
    await game.getByRole("button", { name: "Copy result" }).click();
    await page.waitForTimeout(200);
    const label = await game.locator(".bor-share button").innerText();
    console.log(view.name, "share:", JSON.stringify(shared), "button after click:", JSON.stringify(label));
    await page.waitForTimeout(200);
    assert.deepEqual([...new Set([...errors, ...fixture.errors])], [], `${view.name}: browser errors`);
    await context.close();
  }
  console.log("reads", reads);
} catch (e) { failures.push(e); console.error(e); }
finally { await browser.close(); server.closeAllConnections(); server.close(); await build.close(); await rm(temporary, { recursive: true, force: true }); }
if (failures.length) process.exit(1);
console.log("ok, screenshots in", outdir);
