// Builds media/demo.gif from tests/demo.ts (test sprites, bot input). Needs Playwright's Chromium and ffmpeg.
// Run from the SDK root: CHROME_PATH=/path/to/chromium node games/binding-of-rarefriend/tests/run-demo.mjs
import { build } from "esbuild";
import { chromium } from "playwright";
import { execFileSync } from "node:child_process";
import { mkdir, rm, stat, writeFile } from "node:fs/promises";
const dir = "games/binding-of-rarefriend/.artifacts/demo";
const gif = "games/binding-of-rarefriend/media/demo.gif";
await rm(dir, { recursive: true, force: true });
await mkdir(dir, { recursive: true });
const result = await build({ entryPoints: ["games/binding-of-rarefriend/tests/demo.ts"], bundle: true, format: "iife", write: false, logLevel: "error" });
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });
const page = await browser.newPage();
page.on("pageerror", e => console.error("pageerror", e.message));
await page.exposeFunction("saveFrame", (index, data) => writeFile(`${dir}/f${String(index).padStart(4, "0")}.png`, Buffer.from(data.split(",")[1], "base64")));
await page.setContent(`<html><body style="margin:0;background:#000"></body></html>`);
await page.addScriptTag({ content: result.outputFiles[0].text });
console.log(await page.evaluate(() => window.demo, undefined, { timeout: 300000 }));
await browser.close();
execFileSync(process.env.FFMPEG ?? "ffmpeg", ["-y", "-loglevel", "error", "-framerate", "15", "-i", `${dir}/f%04d.png`,
  "-vf", "scale=640:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=96:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle",
  "-loop", "0", gif], { stdio: "inherit" });
console.log("wrote", gif, `${((await stat(gif)).size / 1e6).toFixed(2)} MB`);
