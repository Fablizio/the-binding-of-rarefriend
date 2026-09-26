"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { GameComponentProps } from "@rarefriends/friendsdk/runtime";
import { GameMenu } from "@rarefriends/friendsdk/frame";
import { createFriendReader, type GenerationSprites } from "@rarefriends/friendsdk/sprites";
import "@rarefriends/friendsdk/frame.css";
import "./style.css";
import { Game, VIEW_H, VIEW_W, type Defeated, type Input, type Vec } from "./engine/game";
import { render } from "./engine/render";
import { loadRoster, type Roster } from "./engine/roster";
import { randomSeed, createRng } from "./engine/rng";
import { Audio } from "./engine/audio";
import { frameCanvas } from "./engine/sprites";
import { FAMILY_NAMES, PERKS, THEMES, type FamilyId } from "./engine/themes";

type Phase = "loading" | "error" | "title" | "playing" | "dead" | "won";
type Stick = { id: number; origin: Vec; at: Vec };
const MOVE_KEYS = new Set(["w", "a", "s", "d", "arrowup", "arrowdown", "arrowleft", "arrowright"]);
const STICK = 70;

/** A canonical Friend portrait drawn from its on-chain sprite. */
function Portrait({ sprites, scale = 4, halo = "#ffffff", label }: { sprites: GenerationSprites; scale?: number; halo?: string; label: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current, ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const facing = sprites.familyId === 6 ? "right" : "down";
    const source = frameCanvas(sprites.clips.idle[facing][0], scale, "#000000", halo);
    ctx.clearRect(0, 0, canvas.width, canvas.height); ctx.drawImage(source, 0, 0);
  }, [sprites, scale, halo]);
  return <canvas ref={ref} width={18 * scale} height={18 * scale} className="bor-portrait" role="img" aria-label={label} />;
}

function formatTime(seconds: number) {
  const m = Math.floor(seconds / 60), s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

export default function BindingOfRareFriend({ friendId, client, paused }: GameComponentProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<Game | null>(null);
  const audioRef = useRef<Audio | null>(null);
  const input = useRef<Input>({ keys: new Set(), move: null, aim: null });
  const sticks = useRef<{ move: Stick | null; aim: Stick | null; mouse: Vec | null }>({ move: null, aim: null, mouse: null });
  const [phase, setPhase] = useState<Phase>("loading");
  const [status, setStatus] = useState("Verifying your Friend and summoning the dungeon…");
  const [player, setPlayer] = useState<GenerationSprites | null>(null);
  const [roster, setRoster] = useState<Roster | null>(null);
  const [menu, setMenu] = useState<"pause" | "settings" | null>(null);
  const [muted, setMuted] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [toast, setToast] = useState<{ title: string; text: string; key: number } | null>(null);
  const [bossBanner, setBossBanner] = useState<{ id: bigint; family: string; sprites: GenerationSprites; key: number } | null>(null);
  const [summary, setSummary] = useState<{ depth: number; kills: number; sparks: number; time: number; defeated: Defeated[] } | null>(null);
  const [revision, setRevision] = useState(0);
  const [touch, setTouch] = useState(false);
  const live = useRef({ paused, menu, phase, reducedMotion });
  live.current = { paused, menu, phase, reducedMotion };

  const clearInput = useCallback(() => {
    input.current.keys.clear(); input.current.move = null; input.current.aim = null;
    sticks.current = { move: null, aim: null, mouse: null };
  }, []);

  // Preferences and device.
  useEffect(() => {
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const coarse = window.matchMedia("(pointer: coarse)");
    const update = () => { setReducedMotion(motion.matches); setTouch(coarse.matches); };
    update(); motion.addEventListener("change", update); coarse.addEventListener("change", update);
    audioRef.current = new Audio();
    return () => { motion.removeEventListener("change", update); coarse.removeEventListener("change", update); audioRef.current?.dispose(); audioRef.current = null; };
  }, []);
  useEffect(() => { audioRef.current?.setMuted(muted); }, [muted]);
  useEffect(() => { if (gameRef.current) gameRef.current.reducedMotion = reducedMotion; }, [reducedMotion]);
  useEffect(() => { if (paused || menu) clearInput(); }, [paused, menu, clearInput]);

  // Load the session, the player's canonical artwork and a fresh cast of real Friends.
  useEffect(() => {
    let cancelled = false;
    gameRef.current = null; setRoster(null); setPhase("loading"); setMenu(null); setSummary(null);
    setStatus("Verifying your Friend and summoning the dungeon…");
    (async () => {
      const [snapshot, sprites] = await Promise.all([client.read(), createFriendReader().read(friendId)]);
      if (snapshot.friendId !== friendId) throw new Error("This game session does not match the selected Friend.");
      if (cancelled) return;
      setPlayer(sprites);
      setStatus("Reading the dungeon's Friends from Robinhood Chain…");
      const cast = await loadRoster(createRng(randomSeed()), friendId, sprites.familyId as FamilyId);
      if (cancelled) return;
      setRoster(cast); setPhase("title");
    })().catch(cause => {
      if (cancelled) return;
      setPhase("error");
      setStatus(cause instanceof Error && cause.message.length < 140 ? cause.message : "The dungeon could not load its Friends. Check your connection and retry.");
    });
    return () => { cancelled = true; };
  }, [friendId, client, revision]);

  const startRun = useCallback(async () => {
    if (!player || !roster || live.current.paused) return;
    void audioRef.current?.unlock();
    const game = new Game(player, player.familyId as FamilyId, roster, randomSeed());
    game.reducedMotion = live.current.reducedMotion;
    game.touch = window.matchMedia("(pointer: coarse)").matches;
    gameRef.current = game;
    clearInput(); setSummary(null); setBossBanner(null); setMenu(null); setPhase("playing");
    canvasRef.current?.focus();
  }, [player, roster, clearInput]);

  const newCast = useCallback(async () => {
    if (!player) return;
    setPhase("loading"); setStatus("Summoning a new cast of Friends…"); gameRef.current = null;
    try {
      const cast = await loadRoster(createRng(randomSeed()), friendId, player.familyId as FamilyId);
      setRoster(cast); setPhase("title");
    } catch {
      setPhase("error"); setStatus("The dungeon could not load its Friends. Check your connection and retry.");
    }
  }, [player, friendId]);

  // Game loop.
  useEffect(() => {
    const canvas = canvasRef.current, ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    let frame = 0, previous = 0;
    const loop = (now: number) => {
      const dt = previous ? Math.min((now - previous) / 1000, 0.05) : 0; previous = now;
      const game = gameRef.current, state = live.current;
      if (game) {
        const running = state.phase === "playing" && !state.paused && !state.menu && !document.hidden;
        if (running) {
          // Mouse aim is relative to the player's current position.
          const mouse = sticks.current.mouse;
          if (mouse) { const dx = mouse.x - game.player.x, dy = mouse.y - (game.player.y - 24), l = Math.hypot(dx, dy) || 1; input.current.aim = { x: dx / l, y: dy / l }; }
          game.update(dt, input.current);
          for (const event of game.drainEvents()) {
            if (event.type === "sfx") audioRef.current?.play(event.sfx);
            else if (event.type === "toast") setToast({ ...event, key: now });
            else if (event.type === "boss") setBossBanner({ id: event.enemy.sprites.tokenId, family: event.enemy.sprites.familyName, sprites: event.enemy.sprites, key: now });
            else if (event.type === "dead" || event.type === "won") {
              setSummary({ depth: game.depth, kills: game.kills, sparks: game.sparks, time: game.time, defeated: [...game.defeated] });
              setPhase(event.type); clearInput();
            }
          }
        }
        render(ctx, game, now);
        paintSticks(ctx);
      } else {
        ctx.fillStyle = "#070708"; ctx.fillRect(0, 0, VIEW_W, VIEW_H);
      }
      frame = requestAnimationFrame(loop);
    };
    const paintSticks = (c: CanvasRenderingContext2D) => {
      for (const stick of [sticks.current.move, sticks.current.aim]) {
        if (!stick) continue;
        c.globalAlpha = 0.35; c.fillStyle = "#ffffff";
        c.beginPath(); c.arc(stick.origin.x, stick.origin.y, STICK, 0, Math.PI * 2); c.fill();
        c.globalAlpha = 0.7; c.fillStyle = stick === sticks.current.aim ? "#ccff00" : "#ffffff";
        c.beginPath(); c.arc(stick.at.x, stick.at.y, 28, 0, Math.PI * 2); c.fill();
        c.globalAlpha = 1;
      }
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, [clearInput]);

  // Toast and boss banner timers.
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(null), 2800); return () => clearTimeout(t); }, [toast]);
  useEffect(() => { if (!bossBanner) return; const t = setTimeout(() => setBossBanner(null), 2200); return () => clearTimeout(t); }, [bossBanner]);

  // Keyboard, blur and visibility.
  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      const k = event.key.toLowerCase(), state = live.current;
      if (state.paused) return;
      if (k === "m" && !event.repeat) { setMuted(value => !value); return; }
      if (state.phase === "playing" && !state.menu) {
        if (MOVE_KEYS.has(k)) { event.preventDefault(); input.current.keys.add(k); }
        if ((k === "p" || k === "escape") && !event.repeat) { event.preventDefault(); clearInput(); setMenu("pause"); }
      } else if (state.phase === "title" && !state.menu && k === "enter" && !event.repeat) { event.preventDefault(); void startRun(); }
    };
    const up = (event: KeyboardEvent) => input.current.keys.delete(event.key.toLowerCase());
    const blur = () => { clearInput(); if (live.current.phase === "playing" && !live.current.menu) setMenu("pause"); };
    const visibility = () => { if (document.hidden) blur(); };
    window.addEventListener("keydown", down); window.addEventListener("keyup", up);
    window.addEventListener("blur", blur); document.addEventListener("visibilitychange", visibility);
    return () => { window.removeEventListener("keydown", down); window.removeEventListener("keyup", up); window.removeEventListener("blur", blur); document.removeEventListener("visibilitychange", visibility); };
  }, [clearInput, startRun]);

  const toView = (event: React.PointerEvent<HTMLCanvasElement>): Vec => {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: (event.clientX - rect.left) * VIEW_W / rect.width, y: (event.clientY - rect.top) * VIEW_H / rect.height };
  };
  const stickVector = (stick: Stick) => {
    const dx = stick.at.x - stick.origin.x, dy = stick.at.y - stick.origin.y, l = Math.hypot(dx, dy);
    if (l > STICK) { stick.at = { x: stick.origin.x + dx / l * STICK, y: stick.origin.y + dy / l * STICK }; }
    const m = Math.min(1, l / STICK);
    return l < 6 ? null : { x: dx / (l || 1) * m, y: dy / (l || 1) * m };
  };
  const active = phase === "playing" && !paused && !menu;

  return <section className="bor-game" aria-label="The Binding of RareFriend, a dungeon crawler">
    <canvas ref={canvasRef} width={VIEW_W} height={VIEW_H} className="bor-canvas" tabIndex={active ? 0 : -1}
      aria-label="Dungeon room. WASD to move, arrow keys or mouse to shoot. On touch, left thumb moves and right thumb shoots. P pauses, M mutes."
      onPointerDown={event => {
        if (!active) return;
        event.preventDefault(); event.currentTarget.focus();
        try { event.currentTarget.setPointerCapture(event.pointerId); } catch { /* capture is optional */ }
        const at = toView(event);
        if (event.pointerType === "mouse") { if (event.button === 0) sticks.current.mouse = at; return; }
        const stick = { id: event.pointerId, origin: at, at };
        if (at.x < VIEW_W / 2) { if (!sticks.current.move) sticks.current.move = stick; }
        else if (!sticks.current.aim) sticks.current.aim = stick;
      }}
      onPointerMove={event => {
        if (!active) return;
        const at = toView(event);
        if (event.pointerType === "mouse") { if (sticks.current.mouse) sticks.current.mouse = at; return; }
        const { move, aim } = sticks.current;
        if (move?.id === event.pointerId) { move.at = at; input.current.move = stickVector(move); }
        if (aim?.id === event.pointerId) { aim.at = at; const v = stickVector(aim); input.current.aim = v && Math.hypot(v.x, v.y) > 0.25 ? v : null; }
      }}
      onPointerUp={event => {
        if (event.pointerType === "mouse") { sticks.current.mouse = null; input.current.aim = null; return; }
        if (sticks.current.move?.id === event.pointerId) { sticks.current.move = null; input.current.move = null; }
        if (sticks.current.aim?.id === event.pointerId) { sticks.current.aim = null; input.current.aim = null; }
      }}
      onPointerCancel={() => clearInput()}
      onContextMenu={event => event.preventDefault()} />

    {phase === "playing" && <div className="bor-side">
      <button type="button" onClick={() => { clearInput(); setMenu("pause"); }} disabled={paused} aria-label="Pause">II</button>
      <button type="button" onClick={() => setMuted(value => !value)} disabled={paused} aria-label={muted ? "Sound on" : "Sound off"} aria-pressed={muted}>{muted ? "♪̸" : "♪"}</button>
    </div>}

    {toast && phase === "playing" && <div className="bor-toast" key={toast.key} role="status"><strong>{toast.title}</strong><span>{toast.text}</span></div>}
    {bossBanner && phase === "playing" && <div className={`bor-boss${reducedMotion ? " still" : ""}`} key={bossBanner.key} role="status">
      <Portrait sprites={bossBanner.sprites} scale={5} halo="#e0243f" label={`Boss Friend number ${bossBanner.id}`} />
      <div><small>BOSS</small><strong>Friend #{String(bossBanner.id)}</strong><span>{bossBanner.family} keeper of {THEMES[bossBanner.sprites.familyId as FamilyId].floorName}</span></div>
    </div>}

    {(phase === "loading" || phase === "error") && <div className="bor-screen" role={phase === "error" ? "alert" : "status"}>
      <h1 className="bor-logo">The Binding of <em>RareFriend</em></h1>
      <p>{status}</p>
      {phase === "loading" && <div className="bor-spinner" aria-hidden="true" />}
      {phase === "error" && <button type="button" className="bor-primary" disabled={paused} onClick={() => setRevision(value => value + 1)}>Retry</button>}
      <p className="bor-credit">made by Fablizio</p>
    </div>}

    {phase === "title" && player && roster && !menu && <div className="bor-screen bor-title">
      <h1 className="bor-logo">The Binding of <em>RareFriend</em></h1>
      <p className="bor-credit">made by Fablizio</p>
      <div className="bor-hero">
        <Portrait sprites={player} scale={6} label={`Your Friend number ${String(friendId)}`} />
        <div>
          <strong>Friend #{String(friendId)}</strong>
          <span>{player.familyName} family</span>
          <span className="bor-perk">Perk: <b>{PERKS[player.familyId as FamilyId].name}</b>. {PERKS[player.familyId as FamilyId].text}</span>
        </div>
      </div>
      <ol className="bor-floors" aria-label="This run's floors">
        {roster.floors.map((floor, index) => <li key={index} style={{ borderColor: THEMES[floor.family].accent }}>
          <small>Floor {index + 1}</small><b>{THEMES[floor.family].floorName}</b><span>{FAMILY_NAMES[floor.family]} · {floor.regulars.length + 1} Friends</span>
        </li>)}
      </ol>
      <div className="bor-actions">
        <button type="button" className="bor-primary" disabled={paused} onClick={() => void startRun()}>Enter the dungeon{touch ? "" : " · Enter"}</button>
        <button type="button" disabled={paused} onClick={() => void newCast()}>New cast</button>
        <button type="button" disabled={paused} onClick={() => setMenu("settings")}>Settings</button>
      </div>
      <p className="bor-hint">{touch ? "Hold your phone sideways. Left thumb moves, right thumb shoots." : "WASD move · Arrows or hold mouse to shoot · P pause · M mute"}</p>
    </div>}

    {(phase === "dead" || phase === "won") && summary && player && !menu && <div className="bor-screen bor-end" role="status">
      <h1 className="bor-logo">{phase === "won" ? "You escaped!" : "You were bound."}</h1>
      <p>{phase === "won" ? `Friend #${String(friendId)} broke free of all ${roster?.floors.length ?? 4} floors.` : `Friend #${String(friendId)} fell on floor ${summary.depth + 1}, ${THEMES[roster!.floors[summary.depth].family].floorName}.`}</p>
      <p className="bor-stats">{summary.kills} defeated · {summary.sparks} sparks · {formatTime(summary.time)}</p>
      {summary.defeated.length > 0 && <>
        <h2>Friends you faced ({summary.defeated.length})</h2>
        <ul className="bor-gallery">
          {summary.defeated.slice(0, 24).map(entry => <li key={String(entry.id)} className={entry.boss ? "boss" : ""}>
            <Portrait sprites={entry.sprites} scale={2} halo={entry.boss ? "#e0243f" : THEMES[entry.family].accent} label={`Friend number ${entry.id}`} />
            <small>#{String(entry.id)}</small>
          </li>)}
        </ul>
      </>}
      <div className="bor-actions">
        <button type="button" className="bor-primary" disabled={paused} onClick={() => void startRun()}>Run it back</button>
        <button type="button" disabled={paused} onClick={() => void newCast()}>New cast</button>
      </div>
      <p className="bor-credit">made by Fablizio</p>
    </div>}

    {menu === "pause" && <GameMenu title="Paused" onClose={() => setMenu(null)}>
      <p>Floor {(gameRef.current?.depth ?? 0) + 1} · {gameRef.current?.theme.floorName}</p>
      <label><input type="checkbox" checked={muted} disabled={paused} onChange={event => setMuted(event.target.checked)} /> Mute sound</label>
      <label><input type="checkbox" checked={reducedMotion} disabled={paused} onChange={event => setReducedMotion(event.target.checked)} /> Reduce motion</label>
      <div className="bor-menu-actions">
        <button type="button" className="rf-frame-primary" disabled={paused} onClick={() => setMenu(null)}>Resume</button>
        <button type="button" disabled={paused} onClick={() => { gameRef.current = null; setMenu(null); setPhase("title"); }}>Quit run</button>
      </div>
      <p className="bor-small">No RF is spent or won. Progress lasts for this run only.</p>
    </GameMenu>}
    {menu === "settings" && <GameMenu title="Settings" onClose={() => setMenu(null)}>
      <label><input type="checkbox" checked={muted} disabled={paused} onChange={event => setMuted(event.target.checked)} /> Mute sound</label>
      <label><input type="checkbox" checked={reducedMotion} disabled={paused} onChange={event => setReducedMotion(event.target.checked)} /> Reduce motion (no shake, fades or bobbing; still sprite frames)</label>
      <p className="bor-small">Every enemy and boss is a real Rare Friends Generations token, drawn from its canonical on-chain artwork. Each run samples a new cast. Play is free: no RF purchases or rewards.</p>
      <button type="button" className="rf-frame-primary" disabled={paused} onClick={() => setMenu(null)}>Back</button>
    </GameMenu>}
  </section>;
}
