/** Canvas renderer for rooms, Friends, shots and the HUD. Everything is drawn from code; no external art. */
import { COLS, ROWS, STEP, key, type Dir, type Room } from "./dungeon";
import { CX, CY, DOOR_POS, IN_H, IN_W, IN_X, IN_Y, TILE, VIEW_H, VIEW_W, WALL, type Enemy, type Game, type PickupKind, type ShopItem } from "./game";
import { generationLabel, LEGENDARY_GOLD } from "./signatures";
import { drawFriend } from "./sprites";
import { FAMILY_NAMES, RELICS, SPECIAL_MOVES, THEMES, type Theme } from "./themes";

const hash = (x: number, y: number, s = 0) => {
  let h = (x * 374761393 + y * 668265263 + s * 2246822519) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

const bgCache = new WeakMap<Room, { canvas: HTMLCanvasElement; family: number }>();

function paintPattern(ctx: CanvasRenderingContext2D, theme: Theme, seed: number) {
  ctx.fillStyle = theme.floor; ctx.fillRect(IN_X, IN_Y, IN_W, IN_H);
  for (let ty = 0; ty < ROWS; ty++) for (let tx = 0; tx < COLS; tx++) {
    const x = IN_X + tx * TILE, y = IN_Y + ty * TILE, r = hash(tx, ty, seed), r2 = hash(ty, tx, seed + 7);
    ctx.fillStyle = theme.floorDetail;
    switch (theme.pattern) {
      case "bones":
        if ((tx + ty) % 2) ctx.fillRect(x, y, TILE, TILE);
        if (r < 0.28) { ctx.fillStyle = "#efe8d2"; ctx.fillRect(x + 14, y + 26, 26, 5); ctx.fillRect(x + 11, y + 23, 6, 11); ctx.fillRect(x + 37, y + 23, 6, 11); }
        break;
      case "curtain":
        ctx.fillRect(x + (tx % 2 ? 0 : 28), y, 28, TILE);
        if (r < 0.12) { ctx.fillStyle = theme.accent; ctx.globalAlpha = 0.25; ctx.fillRect(x + 20, y + 20, 16, 16); ctx.globalAlpha = 1; }
        break;
      case "planks":
        ctx.fillRect(x, y + 27, TILE, 2); ctx.fillRect(x + ((ty % 2) ? 20 : 44), y, 2, 27); ctx.fillRect(x + ((ty % 2) ? 8 : 32), y + 29, 2, 27);
        if (r < 0.1) { ctx.fillRect(x + 12, y + 10, 5, 5); }
        break;
      case "cells":
        if (r < 0.55) { ctx.beginPath(); ctx.arc(x + 10 + r2 * 36, y + 10 + r * 36, 6 + r2 * 10, 0, Math.PI * 2); ctx.strokeStyle = theme.floorDetail; ctx.lineWidth = 3; ctx.stroke(); }
        break;
      case "shards":
        ctx.beginPath(); ctx.moveTo(x + r * TILE, y); ctx.lineTo(x + r2 * TILE, y + TILE); ctx.lineWidth = 2; ctx.strokeStyle = theme.floorDetail; ctx.stroke();
        if ((tx * 3 + ty) % 5 === 0) ctx.fillRect(x + 6, y + 6, 18, 9);
        break;
      case "clouds":
        if (r < 0.35) { ctx.beginPath(); ctx.ellipse(x + 28, y + 30, 22 + r2 * 10, 10, 0, 0, Math.PI * 2); ctx.fill(); }
        break;
      case "slabs":
        if ((tx + ty * 2) % 3 === 0) ctx.fillRect(x + 2, y + 2, TILE - 4, TILE - 4);
        if (r < 0.2) { ctx.fillStyle = theme.wallDetail; ctx.fillRect(x + 10, y + 20, 22, 2); ctx.fillRect(x + 30, y + 20, 2, 14); }
        break;
      case "crystals":
        if ((tx + ty) % 2) ctx.fillRect(x, y, TILE, TILE);
        if (r < 0.2) { ctx.fillStyle = "#fff7c2"; ctx.fillRect(x + 26, y + 18, 4, 16); ctx.fillRect(x + 20, y + 24, 16, 4); }
        break;
      case "void":
        for (let i = 0; i < 3; i++) if (hash(tx, ty, seed + i) < 0.5) ctx.fillRect(x + hash(tx, i, seed) * 52, y + hash(i, ty, seed) * 52, 3, 3);
        break;
    }
  }
}

function paintObstacle(ctx: CanvasRenderingContext2D, theme: Theme, x: number, y: number, r: number) {
  const m = 6, s = TILE - m * 2;
  ctx.fillStyle = "rgba(0,0,0,0.28)"; ctx.fillRect(x + m + 4, y + m + 8, s, s - 4);
  switch (theme.pattern) {
    case "bones":
      ctx.fillStyle = theme.wall; ctx.fillRect(x + m, y + m + 6, s, s - 6);
      ctx.fillStyle = "#efe8d2"; ctx.fillRect(x + 14, y + 10, 28, 22); ctx.fillStyle = theme.wall; ctx.fillRect(x + 19, y + 17, 6, 6); ctx.fillRect(x + 31, y + 17, 6, 6);
      ctx.fillStyle = "#efe8d2"; ctx.fillRect(x + 18, y + 32, 20, 6); break;
    case "curtain":
      ctx.fillStyle = theme.wallDetail; ctx.fillRect(x + m, y + m, s, s);
      ctx.fillStyle = "#f5e6ee"; ctx.fillRect(x + 14, y + 14, 28, 22); ctx.fillStyle = "#000"; ctx.fillRect(x + 19, y + 20, 6, 4); ctx.fillRect(x + 31, y + 20, 6, 4); ctx.fillRect(x + 23, y + 29, 10, 3); break;
    case "planks":
      ctx.fillStyle = theme.wallDetail; ctx.fillRect(x + m, y + m, s, s); ctx.strokeStyle = theme.wall; ctx.lineWidth = 4;
      ctx.strokeRect(x + m + 2, y + m + 2, s - 4, s - 4); ctx.beginPath(); ctx.moveTo(x + m + 2, y + m + 2); ctx.lineTo(x + TILE - m - 2, y + TILE - m - 2); ctx.stroke(); break;
    case "cells":
      ctx.fillStyle = theme.wall; ctx.fillRect(x + 12, y + m, s - 12, s); ctx.fillStyle = theme.accent; ctx.globalAlpha = 0.6; ctx.fillRect(x + 16, y + 22, s - 20, s - 20); ctx.globalAlpha = 1;
      ctx.fillStyle = "#e6fff2"; ctx.fillRect(x + 18, y + 12, 4, 10); break;
    case "shards":
      ctx.fillStyle = theme.wallDetail; ctx.beginPath(); ctx.moveTo(x + m + 10, y + m); ctx.lineTo(x + TILE - m, y + m + 6); ctx.lineTo(x + TILE - m - 8, y + TILE - m); ctx.lineTo(x + m, y + TILE - m - 10); ctx.fill();
      ctx.fillStyle = theme.wall; ctx.fillRect(x + 22, y + 18, 10, 16); break;
    case "clouds":
      ctx.fillStyle = theme.wallDetail; ctx.beginPath(); ctx.arc(x + 20, y + 30, 14, 0, Math.PI * 2); ctx.arc(x + 34, y + 24, 16, 0, Math.PI * 2); ctx.arc(x + 38, y + 36, 12, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = theme.accent; ctx.fillRect(x + 26, y + 40, 4, 10); ctx.fillRect(x + 22, y + 48, 4, 4); break;
    case "slabs":
      ctx.fillStyle = theme.wallDetail; ctx.beginPath(); ctx.arc(x + 28, y + 30, 22, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = theme.wall; ctx.fillRect(x + 16, y + 30, 14, 3); ctx.fillStyle = "rgba(255,255,255,0.25)"; ctx.fillRect(x + 18, y + 14, 10, 6); break;
    case "crystals":
      ctx.fillStyle = theme.wallDetail; ctx.fillRect(x + m, y + 36, s, 14);
      ctx.fillStyle = r < 0.5 ? theme.accent : "#fff3a6"; ctx.beginPath(); ctx.moveTo(x + 28, y + 4); ctx.lineTo(x + 42, y + 36); ctx.lineTo(x + 28, y + 46); ctx.lineTo(x + 14, y + 36); ctx.fill(); break;
    case "void":
      ctx.fillStyle = "#050507"; ctx.beginPath(); ctx.ellipse(x + 28, y + 30, 22, 18, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = theme.accent; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(x + 28, y + 30, 14, 10, r * 3, 0, Math.PI * 1.4); ctx.stroke(); break;
  }
}

function paintWalls(ctx: CanvasRenderingContext2D, theme: Theme, seed: number) {
  ctx.fillStyle = theme.wall;
  ctx.fillRect(IN_X - WALL, IN_Y - WALL, IN_W + WALL * 2, IN_H + WALL * 2);
  ctx.fillStyle = theme.wallDetail;
  for (let i = 0; i < 70; i++) {
    const side = i % 4, t = hash(i, seed, 3);
    const w = 16 + hash(seed, i, 1) * 26;
    if (side === 0) ctx.fillRect(IN_X - WALL + t * (IN_W + WALL * 2 - w), IN_Y - WALL + 6 + (i % 3) * 10, w, 6);
    if (side === 1) ctx.fillRect(IN_X - WALL + t * (IN_W + WALL * 2 - w), IN_Y + IN_H + 8 + (i % 3) * 10, w, 6);
    if (side === 2) ctx.fillRect(IN_X - WALL + 6 + (i % 3) * 10, IN_Y + t * (IN_H - w), 6, w);
    if (side === 3) ctx.fillRect(IN_X + IN_W + 8 + (i % 3) * 10, IN_Y + t * (IN_H - w), 6, w);
  }
  // Inner lip and a soft shadow on the floor.
  ctx.fillStyle = "#000"; ctx.globalAlpha = 0.5;
  ctx.fillRect(IN_X - 4, IN_Y - 4, IN_W + 8, 4); ctx.fillRect(IN_X - 4, IN_Y + IN_H, IN_W + 8, 4);
  ctx.fillRect(IN_X - 4, IN_Y, 4, IN_H); ctx.fillRect(IN_X + IN_W, IN_Y, 4, IN_H);
  ctx.globalAlpha = 0.16; ctx.fillRect(IN_X, IN_Y, IN_W, 14); ctx.fillRect(IN_X, IN_Y, 10, IN_H);
  ctx.globalAlpha = 1;
}

function roomBackground(game: Game, room: Room) {
  const family = game.cast.family;
  const cached = bgCache.get(room);
  if (cached && cached.family === family) return cached.canvas;
  const canvas = document.createElement("canvas");
  canvas.width = VIEW_W; canvas.height = VIEW_H;
  const ctx = canvas.getContext("2d")!;
  const theme = THEMES[family], seed = room.gx * 31 + room.gy * 17 + game.depth * 101;
  paintWalls(ctx, theme, seed);
  paintPattern(ctx, theme, seed);
  for (let ty = 0; ty < ROWS; ty++) for (let tx = 0; tx < COLS; tx++) {
    const tile = room.tiles[ty][tx], x = IN_X + tx * TILE, y = IN_Y + ty * TILE;
    if (tile === 2) {
      ctx.fillStyle = "#050505"; ctx.fillRect(x + 2, y + 2, TILE - 4, TILE - 4);
      ctx.fillStyle = theme.wall; ctx.fillRect(x + 2, y + 2, TILE - 4, 6);
    } else if (tile === 1) paintObstacle(ctx, theme, x, y, hash(tx, ty, seed));
  }
  if (room.kind === "pain") {
    // Room of Pain: blood-red spikes along the walls and a dark red wash, in the floor's own tiles.
    ctx.fillStyle = "rgba(140,0,20,0.18)"; ctx.fillRect(IN_X, IN_Y, IN_W, IN_H);
    const spike = (x: number, y: number, dx: number, dy: number) => {
      ctx.fillStyle = "#000"; ctx.beginPath(); ctx.moveTo(x - dy * 9 - dx, y - dx * 9 - dy); ctx.lineTo(x + dx * 16, y + dy * 16); ctx.lineTo(x + dy * 9 - dx, y + dx * 9 - dy); ctx.fill();
      ctx.fillStyle = "#c81d3a"; ctx.beginPath(); ctx.moveTo(x - dy * 6, y - dx * 6); ctx.lineTo(x + dx * 12, y + dy * 12); ctx.lineTo(x + dy * 6, y + dx * 6); ctx.fill();
    };
    for (let x = IN_X + 20; x < IN_X + IN_W - 10; x += 28) { if (Math.abs(x - CX) > 40) { spike(x, IN_Y, 0, 1); spike(x, IN_Y + IN_H, 0, -1); } }
    for (let y = IN_Y + 24; y < IN_Y + IN_H - 10; y += 28) { if (Math.abs(y - CY) > 40) { spike(IN_X, y, 1, 0); spike(IN_X + IN_W, y, -1, 0); } }
  }
  if (room.kind === "shop") {
    // Shop: a rug in the floor's accent under the pedestals.
    ctx.fillStyle = "rgba(0,0,0,0.3)"; ctx.fillRect(CX - 300, CY - 70, 600, 150);
    ctx.strokeStyle = theme.accent; ctx.lineWidth = 4; ctx.strokeRect(CX - 292, CY - 62, 584, 134);
    ctx.fillStyle = theme.floorDetail; ctx.font = "bold 20px ui-monospace, Menlo, Consolas, monospace"; ctx.textAlign = "center";
    ctx.fillText("SHOP · WALK OVER AN ITEM TO BUY IT", CX, IN_Y + IN_H - 34);
  }
  if (room.kind === "start" && game.depth === 0) {
    ctx.fillStyle = theme.floorDetail; ctx.font = "bold 22px ui-monospace, Menlo, Consolas, monospace"; ctx.textAlign = "center";
    ctx.globalAlpha = 0.9;
    ctx.fillText(game.touch ? "LEFT THUMB  MOVE" : "WASD  MOVE", CX, CY - 70);
    ctx.fillText(game.touch ? "RIGHT THUMB  SHOOT" : "ARROWS / MOUSE  SHOOT", CX, CY - 40);
    ctx.globalAlpha = 1;
  }
  bgCache.set(room, { canvas, family });
  return canvas;
}

function paintDoor(ctx: CanvasRenderingContext2D, game: Game, d: Dir, open: boolean, target: Room | undefined) {
  const theme = game.theme, [x, y] = DOOR_POS[d];
  const horizontal = d === "up" || d === "down";
  const w = horizontal ? TILE - 4 : WALL + 6, h = horizontal ? WALL + 6 : TILE - 4;
  const left = horizontal ? x - w / 2 : d === "left" ? x - WALL - 6 : x;
  const top = horizontal ? (d === "up" ? y - WALL - 6 : y) : y - h / 2;
  const pain = target?.kind === "pain" || (game.room.kind === "pain" && target !== undefined);
  const frame = target?.kind === "boss" ? "#b3122e" : target?.kind === "treasure" ? "#ffd23f" : target?.kind === "shop" ? "#3ddc97" : pain ? "#6e0a1c" : theme.accent;
  if (pain) {
    // Room of Pain door: bone spikes on both sides of a dark red frame, along the wall.
    for (let i = 0; i < 4; i++) {
      const t = (i + 0.5) / 4;
      for (const [color, grow] of [["#000", 3], ["#f2e6d0", 0]] as const) {
        ctx.fillStyle = color;
        if (horizontal) {
          const sy = top - 6 + t * (h + 12);
          ctx.beginPath(); ctx.moveTo(left - 6, sy - 6 - grow); ctx.lineTo(left - 20 - grow, sy); ctx.lineTo(left - 6, sy + 6 + grow); ctx.fill();
          ctx.beginPath(); ctx.moveTo(left + w + 6, sy - 6 - grow); ctx.lineTo(left + w + 20 + grow, sy); ctx.lineTo(left + w + 6, sy + 6 + grow); ctx.fill();
        } else {
          const sx = left - 6 + t * (w + 12);
          ctx.beginPath(); ctx.moveTo(sx - 6 - grow, top - 6); ctx.lineTo(sx, top - 20 - grow); ctx.lineTo(sx + 6 + grow, top - 6); ctx.fill();
          ctx.beginPath(); ctx.moveTo(sx - 6 - grow, top + h + 6); ctx.lineTo(sx, top + h + 20 + grow); ctx.lineTo(sx + 6 + grow, top + h + 6); ctx.fill();
        }
      }
    }
  }
  ctx.fillStyle = frame; ctx.fillRect(left - 6, top - 6, w + 12, h + 12);
  if (pain) { ctx.strokeStyle = "#ff2e4d"; ctx.lineWidth = 2; ctx.strokeRect(left - 5, top - 5, w + 10, h + 10); }
  ctx.fillStyle = "#050505"; ctx.fillRect(left, top, w, h);
  if (!open) {
    ctx.fillStyle = theme.wallDetail;
    if (horizontal) for (let i = 0; i < 4; i++) ctx.fillRect(left + 6 + i * 12, top, 5, h);
    else for (let i = 0; i < 4; i++) ctx.fillRect(left, top + 6 + i * 12, w, 5);
  }
  const cx = left + w / 2, cy = top + h / 2;
  if (target?.kind === "boss") { ctx.fillStyle = "#fff"; ctx.fillRect(cx - 7, cy - 7, 14, 10); ctx.fillStyle = "#b3122e"; ctx.fillRect(cx - 4, cy - 4, 3, 3); ctx.fillRect(cx + 1, cy - 4, 3, 3); }
  if (pain) paintDrop(ctx, cx, cy, 1);
  if (target?.kind === "shop" && !target.locked) paintCoin(ctx, cx, cy, 7);
  if (target?.locked) paintPadlock(ctx, cx, cy, 1.4);
}

/** A gold padlock (locked doors and chests). */
function paintPadlock(ctx: CanvasRenderingContext2D, x: number, y: number, s: number) {
  ctx.strokeStyle = "#000"; ctx.lineWidth = 6 * s; ctx.beginPath(); ctx.arc(x, y - 3 * s, 6 * s, Math.PI, 0); ctx.stroke();
  ctx.strokeStyle = "#c9c9c9"; ctx.lineWidth = 3 * s; ctx.beginPath(); ctx.arc(x, y - 3 * s, 6 * s, Math.PI, 0); ctx.stroke();
  ctx.fillStyle = "#000"; ctx.fillRect(x - 10 * s, y - 4 * s, 20 * s, 16 * s);
  ctx.fillStyle = "#ffd23f"; ctx.fillRect(x - 8 * s, y - 2 * s, 16 * s, 12 * s);
  ctx.fillStyle = "#000"; ctx.fillRect(x - 1.5 * s, y + 1 * s, 3 * s, 6 * s);
}

/** A red drop (Room of Pain). */
function paintDrop(ctx: CanvasRenderingContext2D, x: number, y: number, s: number) {
  const path = (k: number) => { ctx.beginPath(); ctx.moveTo(x, y - 11 * s * k); ctx.quadraticCurveTo(x + 8 * s * k, y, x + 7 * s * k, y + 4 * s * k); ctx.arc(x, y + 4 * s * k, 7 * s * k, 0, Math.PI); ctx.quadraticCurveTo(x - 8 * s * k, y, x, y - 11 * s * k); };
  ctx.fillStyle = "#000"; path(1.3); ctx.fill();
  ctx.fillStyle = "#ff2e4d"; path(1); ctx.fill();
  ctx.fillStyle = "#ffd0d6"; ctx.fillRect(x - 3 * s, y + 1 * s, 2 * s, 3 * s);
}

function paintCoin(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
  ctx.fillStyle = "#000"; ctx.beginPath(); ctx.arc(x, y, r + 2, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#ffd23f"; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#b8860b"; ctx.fillRect(x - 1, y - r * 0.55, 2, r * 1.1);
}

function paintKey(ctx: CanvasRenderingContext2D, x: number, y: number, s = 1) {
  ctx.fillStyle = "#000"; ctx.fillRect(x - 9 * s, y - 7 * s, 10 * s, 12 * s); ctx.fillRect(x - 1 * s, y - 3 * s, 14 * s, 5 * s); ctx.fillRect(x + 7 * s, y, 7 * s, 7 * s);
  ctx.fillStyle = "#ffd23f"; ctx.fillRect(x - 7 * s, y - 5 * s, 6 * s, 8 * s); ctx.fillRect(x - 1 * s, y - 1 * s, 13 * s, 2 * s); ctx.fillRect(x + 8 * s, y + 1 * s, 2 * s, 4 * s); ctx.fillRect(x + 11 * s, y + 1 * s, 2 * s, 3 * s);
  ctx.fillStyle = "#000"; ctx.fillRect(x - 5 * s, y - 3 * s, 2 * s, 4 * s);
}

function paintChest(ctx: CanvasRenderingContext2D, x: number, y: number, locked: boolean) {
  ctx.save(); ctx.translate(x, y); ctx.scale(1.25, 1.25); ctx.translate(-x, -y);
  ctx.fillStyle = "rgba(0,0,0,0.3)"; ctx.fillRect(x - 18, y + 8, 38, 6);
  ctx.fillStyle = "#000"; ctx.fillRect(x - 19, y - 18, 38, 30);
  ctx.fillStyle = locked ? "#8d949c" : "#8a5a2b"; ctx.fillRect(x - 17, y - 16, 34, 26);
  ctx.fillStyle = locked ? "#5d636a" : "#5e3a17"; ctx.fillRect(x - 17, y - 6, 34, 3);
  ctx.fillStyle = locked ? "#ffd23f" : "#c98a4b"; ctx.fillRect(x - 17, y - 16, 4, 26); ctx.fillRect(x + 13, y - 16, 4, 26);
  if (locked) paintPadlock(ctx, x, y - 2, 0.6);
  else { ctx.fillStyle = "#ffd23f"; ctx.fillRect(x - 3, y - 8, 6, 6); }
  ctx.restore();
}

function paintPickup(ctx: CanvasRenderingContext2D, kind: PickupKind, x: number, y: number) {
  switch (kind) {
    case "spark":
      ctx.fillStyle = "#000"; ctx.fillRect(x - 8, y - 10, 16, 16);
      ctx.fillStyle = "#ccff00"; ctx.fillRect(x - 6, y - 8, 12, 12); ctx.fillStyle = "#000"; ctx.fillRect(x - 2, y - 4, 4, 4); break;
    case "coin": paintCoin(ctx, x, y - 2, 7); break;
    case "key": paintKey(ctx, x - 2, y - 2); break;
    case "chest": case "lockedChest": paintChest(ctx, x, y, kind === "lockedChest"); break;
    default: paintHeart(ctx, x - 10, y - 14, kind === "heart" ? 2 : 1, 3);
  }
}

function paintShopItem(ctx: CanvasRenderingContext2D, game: Game, item: ShopItem, now: number) {
  const theme = game.theme;
  ctx.fillStyle = "rgba(0,0,0,0.3)"; ctx.fillRect(item.x - 22, item.y + 4, 44, 10);
  ctx.fillStyle = theme.wallDetail; ctx.fillRect(item.x - 20, item.y - 16, 40, 24);
  ctx.fillStyle = theme.wall; ctx.fillRect(item.x - 24, item.y - 20, 48, 8);
  if (item.sold) return;
  const bob = game.reducedMotion ? 0 : Math.sin(now / 300 + item.x) * 3, gy = item.y - 42 + bob;
  switch (item.kind) {
    case "half": paintHeart(ctx, item.x - 10, gy - 9, 1, 3); break;
    case "heart": paintHeart(ctx, item.x - 10, gy - 9, 2, 3); break;
    case "container": paintHeart(ctx, item.x - 14, gy - 12, 2, 4); ctx.fillStyle = "#fff"; ctx.fillRect(item.x + 8, gy - 16, 10, 3); ctx.fillRect(item.x + 11.5, gy - 19.5, 3, 10); break;
    case "key": paintKey(ctx, item.x - 3, gy, 1.3); break;
    case "relic":
      ctx.fillStyle = "#ccff00"; ctx.beginPath(); ctx.moveTo(item.x, gy - 16); ctx.lineTo(item.x + 14, gy); ctx.lineTo(item.x, gy + 16); ctx.lineTo(item.x - 14, gy); ctx.fill();
      ctx.strokeStyle = "#000"; ctx.lineWidth = 3; ctx.stroke(); break;
  }
  const name = item.kind === "relic" ? RELICS.find(r => r.id === item.relic)!.name : item.kind === "container" ? "Heart container" : item.kind === "half" ? "Half heart" : item.kind === "heart" ? "Heart" : "Key";
  const afford = game.coins >= item.price;
  ctx.font = "bold 12px ui-monospace, monospace"; ctx.textAlign = "center";
  ctx.fillStyle = "#000"; ctx.fillText(name, item.x + 1, item.y + 29); ctx.fillStyle = "#fff"; ctx.fillText(name, item.x, item.y + 28);
  // Price tag.
  ctx.font = "bold 15px ui-monospace, monospace";
  const label = `${item.price}`, tw = ctx.measureText(label).width + 26;
  ctx.fillStyle = "#000"; ctx.fillRect(item.x - tw / 2, item.y + 34, tw, 22);
  ctx.strokeStyle = afford ? "#ffd23f" : "#6b6b6b"; ctx.lineWidth = 2; ctx.strokeRect(item.x - tw / 2, item.y + 34, tw, 22);
  paintCoin(ctx, item.x - tw / 2 + 10, item.y + 45, 5);
  ctx.fillStyle = afford ? "#ffd23f" : "#9a9a9a"; ctx.textAlign = "left"; ctx.fillText(label, item.x - tw / 2 + 19, item.y + 51); ctx.textAlign = "center";
}

function paintHeart(ctx: CanvasRenderingContext2D, x: number, y: number, fill: 0 | 1 | 2, s = 3) {
  const rows = [".XX.XX.", "XXXXXXX", "XXXXXXX", ".XXXXX.", "..XXX..", "...X..."];
  rows.forEach((row, ry) => [...row].forEach((c, rx) => {
    if (c !== "X") return;
    const filled = fill === 2 || (fill === 1 && rx < 4);
    ctx.fillStyle = filled ? "#ff3b4e" : "#3b2327";
    ctx.fillRect(x + rx * s, y + ry * s, s, s);
  }));
}

function paintMinimap(ctx: CanvasRenderingContext2D, game: Game) {
  const seen = [...game.floor.rooms.values()].filter(room => room.seen);
  const xs = seen.map(r => r.gx), ys = seen.map(r => r.gy);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const cols = maxX - minX + 1, rows = maxY - minY + 1;
  const cw = Math.min(18, Math.floor(150 / cols)), ch = Math.min(11, Math.floor(52 / rows));
  const ox = VIEW_W - 12 - cols * cw, oy = 6;
  ctx.fillStyle = "rgba(0,0,0,0.55)"; ctx.fillRect(ox - 4, oy - 3, cols * cw + 8, rows * ch + 6);
  for (const room of seen) {
    const x = ox + (room.gx - minX) * cw, y = oy + (room.gy - minY) * ch;
    ctx.fillStyle = room === game.room ? "#ffffff" : room.visited ? "#8a8a8a" : "#3b3b3b";
    ctx.fillRect(x + 1, y + 1, cw - 2, ch - 2);
    if (room.kind === "boss") { ctx.fillStyle = "#e0243f"; ctx.fillRect(x + cw / 2 - 2, y + ch / 2 - 2, 4, 4); }
    if (room.kind === "treasure") { ctx.fillStyle = "#ffd23f"; ctx.fillRect(x + cw / 2 - 2, y + ch / 2 - 2, 4, 4); }
    if (room.kind === "shop") { ctx.fillStyle = "#000"; ctx.beginPath(); ctx.arc(x + cw / 2, y + ch / 2, 4, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = "#3ddc97"; ctx.beginPath(); ctx.arc(x + cw / 2, y + ch / 2, 2.6, 0, Math.PI * 2); ctx.fill(); }
    if (room.kind === "pain") {
      const cx = x + cw / 2, cy = y + ch / 2;
      ctx.fillStyle = "#000"; ctx.beginPath(); ctx.moveTo(cx, cy - 5); ctx.lineTo(cx + 4, cy + 1); ctx.arc(cx, cy + 1, 4, 0, Math.PI); ctx.fill();
      ctx.fillStyle = "#ff2e4d"; ctx.beginPath(); ctx.moveTo(cx, cy - 3.5); ctx.lineTo(cx + 2.6, cy + 1); ctx.arc(cx, cy + 1, 2.6, 0, Math.PI); ctx.fill();
    }
    if (room.locked) {
      // A tiny padlock in the cell's corner.
      const lx = x + cw - 6, ly = y + 2;
      ctx.fillStyle = "#000"; ctx.fillRect(lx - 1, ly, 7, 7);
      ctx.fillStyle = "#ffd23f"; ctx.fillRect(lx, ly + 3, 5, 3); ctx.fillStyle = "#c9c9c9"; ctx.fillRect(lx + 1, ly + 1, 1, 2); ctx.fillRect(lx + 3, ly + 1, 1, 2); ctx.fillRect(lx + 1, ly + 1, 3, 1);
    }
    if (room.special && !room.cleared) {
      // Elite room: a small gold diamond with a dark rim.
      const cx = x + cw / 2, cy = y + ch / 2;
      ctx.fillStyle = "#000"; ctx.beginPath(); ctx.moveTo(cx, cy - 5); ctx.lineTo(cx + 5, cy); ctx.lineTo(cx, cy + 5); ctx.lineTo(cx - 5, cy); ctx.fill();
      ctx.fillStyle = "#ffb000"; ctx.beginPath(); ctx.moveTo(cx, cy - 3); ctx.lineTo(cx + 3, cy); ctx.lineTo(cx, cy + 3); ctx.lineTo(cx - 3, cy); ctx.fill();
    }
  }
}

function paintEnemy(ctx: CanvasRenderingContext2D, game: Game, e: Enemy, frame: number) {
  const theme = game.theme;
  const halo = e.flash > 0 ? "#ffffff" : e.special ? "#ffb000" : e.elite ? "#ffffff" : theme.accent;
  const ink = e.flash > 0 ? theme.accent : "#000000";
  let alpha = e.alpha;
  if (e.spawn > 0) alpha *= 1 - e.spawn / 0.5;
  const shadowW = e.r * 1.1;
  ctx.fillStyle = "rgba(0,0,0,0.25)"; ctx.beginPath(); ctx.ellipse(e.x, e.y + 2, shadowW, shadowW * 0.35, 0, 0, Math.PI * 2); ctx.fill();
  if (e.special && alpha > 0.5) { ctx.strokeStyle = "#ffb000"; ctx.lineWidth = 4; ctx.beginPath(); ctx.ellipse(e.x, e.y + 2, shadowW + 8, shadowW * 0.35 + 4, 0, 0, Math.PI * 2); ctx.stroke(); }
  if (e.elite && alpha > 0.5) { ctx.strokeStyle = theme.accent; ctx.lineWidth = 3; ctx.beginPath(); ctx.ellipse(e.x, e.y + 2, shadowW + 6, shadowW * 0.35 + 3, 0, 0, Math.PI * 2); ctx.stroke(); }
  let x = e.x, y = e.y - e.lift;
  if ((e.state === "windup" || e.state === "charge-windup") && !game.reducedMotion) x += Math.sin(game.time * 60) * 2;
  if (alpha <= 0.02) return;
  drawFriend(ctx, e.sprites, x, y + 2, { facing: e.facing, side: e.side, walking: e.moving, frame }, e.scale, ink, halo, alpha);
  if (e.special && alpha > 0.5) {
    // Elite health bar above its head.
    const w = 56, bx = e.x - w / 2, by = y - e.r * 2 - 30;
    ctx.fillStyle = "#000"; ctx.fillRect(bx - 2, by - 2, w + 4, 8);
    ctx.fillStyle = "#3a2a00"; ctx.fillRect(bx, by, w, 4);
    ctx.fillStyle = "#ffb000"; ctx.fillRect(bx, by, w * Math.max(0, e.hp / e.maxHp), 4);
  }
}

export function render(ctx: CanvasRenderingContext2D, game: Game, now: number) {
  const theme = game.theme, room = game.room, state = game.state, p = game.player;
  const frame = game.reducedMotion ? 0 : Math.floor(now / 110) % 8;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = "#070708"; ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  const shake = game.shake > 0 && !game.reducedMotion ? 5 * game.shake / 0.3 : 0;
  ctx.save();
  if (shake) ctx.translate((Math.random() - 0.5) * shake * 2, (Math.random() - 0.5) * shake * 2);
  ctx.drawImage(roomBackground(game, room), 0, 0);
  for (const d of Object.keys(room.doors) as Dir[]) {
    const target = game.floor.rooms.get(key(room.gx + STEP[d][0], room.gy + STEP[d][1]));
    paintDoor(ctx, game, d, game.doorOpen(d), target);
  }
  // Trapdoor / exit light.
  if (state.trapdoor) {
    const last = game.depth + 1 >= game.floors;
    ctx.fillStyle = last ? "#fffbe0" : "#000"; ctx.fillRect(CX - 30, CY - 22, 60, 44);
    ctx.strokeStyle = last ? "#ffe45c" : theme.accent; ctx.lineWidth = 4; ctx.strokeRect(CX - 30, CY - 22, 60, 44);
    if (!last) { ctx.fillStyle = theme.wallDetail; for (let i = 0; i < 3; i++) ctx.fillRect(CX - 22, CY - 14 + i * 12, 44, 4); }
    ctx.fillStyle = "#fff"; ctx.font = "bold 12px ui-monospace, monospace"; ctx.textAlign = "center";
    ctx.fillText(last ? "ESCAPE" : "DESCEND", CX, CY + 40);
  }
  if (state.pedestal) {
    const ped = state.pedestal;
    ctx.fillStyle = "rgba(0,0,0,0.3)"; ctx.fillRect(ped.x - 22, ped.y + 4, 44, 10);
    ctx.fillStyle = theme.wallDetail; ctx.fillRect(ped.x - 20, ped.y - 16, 40, 24);
    ctx.fillStyle = theme.wall; ctx.fillRect(ped.x - 24, ped.y - 20, 48, 8);
    if (!ped.taken) {
      const bob = game.reducedMotion ? 0 : Math.sin(now / 300) * 4, gy = ped.y - 46 + bob;
      ctx.fillStyle = ped.relic === "heart" ? "#ff3b4e" : "#ccff00";
      ctx.beginPath(); ctx.moveTo(ped.x, gy - 16); ctx.lineTo(ped.x + 14, gy); ctx.lineTo(ped.x, gy + 16); ctx.lineTo(ped.x - 14, gy); ctx.fill();
      ctx.strokeStyle = "#000"; ctx.lineWidth = 3; ctx.stroke();
      const label = ped.relic === "heart" ? "Heart container" : RELICS.find(r => r.id === ped.relic)!.name;
      ctx.fillStyle = "#000"; ctx.font = "bold 13px ui-monospace, monospace"; ctx.textAlign = "center"; ctx.fillText(label, ped.x, ped.y + 30);
    }
  }
  for (const item of state.shop) paintShopItem(ctx, game, item, now);
  for (const item of state.pickups) {
    const chest = item.kind === "chest" || item.kind === "lockedChest";
    const bob = game.reducedMotion || chest ? 0 : Math.sin(now / 200 + item.x) * 2;
    if (!chest) { ctx.fillStyle = "rgba(0,0,0,0.25)"; ctx.beginPath(); ctx.ellipse(item.x, item.y + 8, 10, 4, 0, 0, Math.PI * 2); ctx.fill(); }
    paintPickup(ctx, item.kind, item.x, item.y + bob);
  }
  // Trailblazer embers sit on the floor under everyone.
  for (const ember of game.embers) {
    const k = Math.max(0, ember.life / 0.9), size = 4 + Math.round(k * 4);
    ctx.globalAlpha = 0.35 + k * 0.6;
    ctx.fillStyle = "#000"; ctx.fillRect(Math.round(ember.x - size / 2) - 1, Math.round(ember.y - size / 2) - 1, size + 2, size + 2);
    ctx.fillStyle = k > 0.5 ? "#ccff00" : "#ff8a00"; ctx.fillRect(Math.round(ember.x - size / 2), Math.round(ember.y - size / 2), size, size);
  }
  ctx.globalAlpha = 1;
  // Depth-sorted actors.
  type Layer = { y: number; draw: () => void };
  const layers: Layer[] = [];
  for (const e of state.enemies) layers.push({ y: e.y, draw: () => paintEnemy(ctx, game, e, frame) });
  const flicker = p.invuln > 0 && game.status === "playing" && Math.floor(now / 80) % 2 === 0;
  layers.push({ y: p.y, draw: () => {
    ctx.fillStyle = "rgba(0,0,0,0.25)"; ctx.beginPath(); ctx.ellipse(p.x, p.y + 2, 20, 7, 0, 0, Math.PI * 2); ctx.fill();
    const lift = game.stats.flying ? 6 + (game.reducedMotion ? 0 : Math.sin(now / 250) * 2) : 0;
    drawFriend(ctx, game.playerSprites, p.x, p.y + 2 - lift, { facing: p.facing, side: p.side, walking: p.moving, frame }, 4, "#000000", "#ffffff",
      flicker && !game.reducedMotion ? 0.35 : 1, game.genBonus?.generation === 1 ? LEGENDARY_GOLD : undefined);
  } });
  for (const familiar of game.familiars) layers.push({ y: familiar.y, draw: () =>
    drawFriend(ctx, game.playerSprites, familiar.x, familiar.y, { facing: p.facing, side: p.side, walking: p.moving, frame }, 2, "#000000", "#ccff00") });
  if (game.signature.id === "orbit" && game.status === "playing") {
    const shard = game.orbitPosition();
    layers.push({ y: shard.y + 20, draw: () => {
      const spin = game.reducedMotion ? 0 : now / 120;
      ctx.save(); ctx.translate(shard.x, shard.y); ctx.rotate(spin);
      ctx.fillStyle = "#000"; ctx.fillRect(-9, -9, 18, 18);
      ctx.fillStyle = "#ccff00"; ctx.fillRect(-6, -6, 12, 12);
      ctx.fillStyle = "#ffffff"; ctx.fillRect(-2, -2, 4, 4);
      ctx.restore();
    } });
  }
  layers.sort((a, b) => a.y - b.y).forEach(layer => layer.draw());
  for (const tear of game.tears) {
    ctx.fillStyle = "rgba(0,0,0,0.2)"; ctx.beginPath(); ctx.ellipse(tear.x, tear.y + 18, tear.r * 0.8, tear.r * 0.3, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#000"; ctx.beginPath(); ctx.arc(tear.x, tear.y, tear.r + 2, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = tear.friendly ? (game.stats.homing || tear.boomer === "back" ? "#ccff00" : "#ffffff") : theme.accent;
    ctx.beginPath(); ctx.arc(tear.x, tear.y, tear.r, 0, Math.PI * 2); ctx.fill();
    if (tear.big) { ctx.strokeStyle = "#ccff00"; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(tear.x, tear.y, tear.r + 5, 0, Math.PI * 2); ctx.stroke(); }
  }
  // Chain Spark arcs: a jagged pixel bolt between two Friends.
  for (const zap of game.zaps) {
    ctx.globalAlpha = Math.min(1, zap.life / 0.1);
    ctx.strokeStyle = "#000"; ctx.lineWidth = 6; ctx.beginPath(); zapPath(ctx, zap.x1, zap.y1, zap.x2, zap.y2); ctx.stroke();
    ctx.strokeStyle = "#ccff00"; ctx.lineWidth = 3; ctx.beginPath(); zapPath(ctx, zap.x1, zap.y1, zap.x2, zap.y2); ctx.stroke();
  }
  ctx.globalAlpha = 1;
  for (const particle of game.particles) {
    ctx.globalAlpha = Math.max(0, particle.life / particle.max); ctx.fillStyle = particle.color;
    ctx.fillRect(Math.round(particle.x), Math.round(particle.y), particle.size, particle.size);
  }
  ctx.globalAlpha = 1;
  ctx.font = "bold 14px ui-monospace, monospace"; ctx.textAlign = "center";
  for (const text of game.texts) {
    ctx.globalAlpha = Math.min(1, text.life * 2);
    ctx.fillStyle = "#000"; ctx.fillText(text.text, text.x + 1, text.y + 1);
    ctx.fillStyle = text.color; ctx.fillText(text.text, text.x, text.y);
  }
  ctx.globalAlpha = 1;
  ctx.restore();
  paintHud(ctx, game);
  if (game.fade > 0) { ctx.fillStyle = `rgba(0,0,0,${game.fade})`; ctx.fillRect(0, 0, VIEW_W, VIEW_H); }
}

function zapPath(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number) {
  const dx = x2 - x1, dy = y2 - y1, l = Math.hypot(dx, dy) || 1, nx = -dy / l, ny = dx / l;
  ctx.moveTo(x1, y1);
  for (let i = 1; i < 5; i++) { const k = i / 5, off = (i % 2 ? 1 : -1) * 9; ctx.lineTo(x1 + dx * k + nx * off, y1 + dy * k + ny * off); }
  ctx.lineTo(x2, y2);
}

function paintHud(ctx: CanvasRenderingContext2D, game: Game) {
  const s = game.stats, p = game.player, theme = game.theme;
  const hearts = Math.ceil(s.maxHp / 2);
  for (let i = 0; i < hearts; i++) {
    const value = p.hp - i * 2;
    paintHeart(ctx, 14 + (i % 6) * 25, 10 + Math.floor(i / 6) * 22, value >= 2 ? 2 : value === 1 ? 1 : 0, 3);
  }
  ctx.textAlign = "left"; ctx.font = "bold 14px ui-monospace, monospace";
  // Sparks, coins and keys (all run-only).
  const row = hearts > 6 ? 58 : 38;
  ctx.fillStyle = "#ccff00"; ctx.fillRect(16, row, 10, 10);
  ctx.fillStyle = "#fff"; ctx.fillText(`${game.sparks}`, 32, row + 10);
  paintCoin(ctx, 72, row + 5, 5);
  ctx.fillStyle = "#fff"; ctx.fillText(`${game.coins}`, 82, row + 10);
  paintKey(ctx, 122, row + 5, 0.7);
  ctx.fillStyle = "#fff"; ctx.fillText(`${game.keys}`, 134, row + 10);
  ctx.textAlign = "center";
  ctx.fillStyle = theme.accent; ctx.font = "bold 18px ui-monospace, monospace";
  ctx.fillText(`FLOOR ${game.depth + 1}/${game.floors} · ${theme.floorName.toUpperCase()}`, VIEW_W / 2, 26);
  ctx.fillStyle = "#9a9a9a"; ctx.font = "12px ui-monospace, monospace";
  const boss = game.boss, elite = boss ? null : game.special;
  if (boss) { ctx.fillStyle = "#ff6b7d"; ctx.font = "bold 13px ui-monospace, monospace"; }
  else if (elite) { ctx.fillStyle = "#ffb000"; ctx.font = "bold 13px ui-monospace, monospace"; }
  const hostile = game.state.enemies.filter(e => !e.decoy).length;
  ctx.fillText(boss ? `BOSS · Friend #${boss.sprites.tokenId} · ${boss.sprites.familyName}`
    : elite ? `ELITE · Friend #${elite.sprites.tokenId} · ${SPECIAL_MOVES[elite.family]}`
    : `${FAMILY_NAMES[game.cast.family]} territory · ${hostile ? `${hostile} Friends hostile` : "room clear"}`, VIEW_W / 2, 46);
  paintMinimap(ctx, game);
  // Signature, generation bonus, perk, then relics collected.
  const bottom = IN_Y + IN_H + WALL + 19;
  ctx.textAlign = "center"; ctx.font = "bold 13px ui-monospace, monospace";
  const sig = game.signature, gen = game.genBonus;
  // Signature in lime, then the generation tier (gold for Legendary), centred together.
  const segments: [string, string][] = [[`◆ ${sig.name.toUpperCase()}: ${sig.text}`, "#ccff00"]];
  if (gen) segments.push(["  ·  ", "#ccff00"], [generationLabel(gen), gen.generation === 1 ? LEGENDARY_GOLD : "#ffffff"]);
  let size = 13;
  const width = () => segments.reduce((sum, [text]) => sum + ctx.measureText(text).width, 0);
  while (size > 10 && width() > 920) { size--; ctx.font = `bold ${size}px ui-monospace, monospace`; }
  const scaleX = Math.min(1, 920 / width());
  ctx.save(); ctx.translate(VIEW_W / 2, bottom); ctx.scale(scaleX, 1); ctx.textAlign = "left";
  let cursor = -width() / 2;
  for (const [text, color] of segments) { ctx.fillStyle = color; ctx.fillText(text, cursor, 0); cursor += ctx.measureText(text).width; }
  ctx.restore(); ctx.textAlign = "center";
  ctx.font = "12px ui-monospace, monospace"; ctx.fillStyle = "#bdbdbd";
  const relicNames = game.relics.map(id => RELICS.find(r => r.id === id)!.name);
  ctx.fillText(`Perk: ${game.perk.name}${relicNames.length ? " · " + relicNames.join(" · ") : ""}`, VIEW_W / 2, bottom + 17, 760);
  if (boss) {
    const w = 420, x = (VIEW_W - w) / 2, y = bottom + 24;
    ctx.fillStyle = "#000"; ctx.fillRect(x - 3, y - 3, w + 6, 16);
    ctx.fillStyle = "#3a0d15"; ctx.fillRect(x, y, w, 10);
    ctx.fillStyle = "#e0243f"; ctx.fillRect(x, y, w * Math.max(0, boss.hp / boss.maxHp), 10);
  }
}
