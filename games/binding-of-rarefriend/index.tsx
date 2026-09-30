"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { GameComponentProps } from "@rarefriends/friendsdk/runtime";
import { GameMenu } from "@rarefriends/friendsdk/frame";
import { createFriendReader, type GenerationSprites } from "@rarefriends/friendsdk/sprites";
import "@rarefriends/friendsdk/frame.css";
import "./style.css";
import { Game, VIEW_H, VIEW_W, type Defeated, type Input, type Vec } from "./engine/game";
import { render } from "./engine/render";
import { loadRoster, readGeneration, type Roster } from "./engine/roster";
import { randomSeed, createRng } from "./engine/rng";
import { Audio } from "./engine/audio";
import { frameCanvas } from "./engine/sprites";
import { FAMILY_NAMES, PERKS, THEMES, type FamilyId } from "./engine/themes";
import { generationBonus, generationLabel, signatureFor } from "./engine/signatures";

type Phase = "loading" | "error" | "title" | "playing" | "dead" | "won";
type Stick = { id: number; origin: Vec; at: Vec };
const MOVE_KEYS = new Set(["w", "a", "s", "d", "arrowup", "arrowdown", "arrowleft", "arrowright"]);
const STICK = 70;
const PREVIEW_URL = "https://fablizio.github.io/the-binding-of-rarefriend/";

/** A canonical Friend portrait drawn from its on-chain sprite. */
function Portrait({ sprites, scale = 4, halo = "#ffffff", label, legendary = false }: { sprites: GenerationSprites; scale?: number; halo?: string; label: string; legendary?: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current, ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const facing = sprites.familyId === 6 ? "right" : "down";
    const source = frameCanvas(sprites.clips.idle[facing][0], scale, "#000000", halo);
    ctx.clearRect(0, 0, canvas.width, canvas.height); ctx.drawImage(source, 0, 0);
  }, [sprites, scale, halo]);
  return <canvas ref={ref} width={18 * scale} height={18 * scale} className={`bor-portrait${legendary ? " bor-legendary" : ""}`} role="img" aria-label={label} />;
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
  const [vs, setVs] = useState<{ boss: GenerationSprites; floorName: string; accent: string; key: number } | null>(null);
  const vsOpen = useRef(false);
  const [musicOn, setMusicOn] = useState(true);
  /** Bumped by every roster load, so a slow load that was superseded (New cast twice, Friend change) is ignored. */
  const loadToken = useRef(0);
  const [summary, setSummary] = useState<{ depth: number; kills: number; sparks: number; time: number; defeated: Defeated[]; floors: number } | null>(null);
  const [generation, setGeneration] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);
  const shareRef = useRef<HTMLTextAreaElement>(null);
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
  useEffect(() => { audioRef.current?.setMusic(musicOn); }, [musicOn]);
  useEffect(() => { if (gameRef.current) gameRef.current.reducedMotion = reducedMotion; }, [reducedMotion]);
  useEffect(() => { if (paused || menu) clearInput(); }, [paused, menu, clearInput]);

  // Load the session, the player's canonical artwork and a fresh cast of real Friends.
  useEffect(() => {
    let cancelled = false;
    const token = ++loadToken.current;
    gameRef.current = null; vsOpen.current = false; setVs(null); setRoster(null); setPhase("loading"); setMenu(null); setSummary(null); setGeneration(null);
    setStatus("Verifying your Friend and summoning the dungeon…");
    // Your own Friend's generation: one read, never blocking. A failed read means no generation bonus.
    const generationRead = readGeneration(friendId);
    (async () => {
      const [snapshot, sprites] = await Promise.all([client.read(), createFriendReader().read(friendId)]);
      if (snapshot.friendId !== friendId) throw new Error("This game session does not match the selected Friend.");
      if (cancelled) return;
      setPlayer(sprites);
      setStatus("Reading the dungeon's Friends from Robinhood Chain…");
      const cast = await loadRoster(createRng(randomSeed()), friendId, sprites.familyId as FamilyId);
      const gen = await generationRead;
      if (cancelled || token !== loadToken.current) return;
      setGeneration(gen); setRoster(cast); setPhase("title");
    })().catch(cause => {
      if (cancelled || token !== loadToken.current) return;
      setPhase("error");
      setStatus(cause instanceof Error && cause.message.length < 140 ? cause.message : "The dungeon could not load its Friends. Check your connection and retry.");
    });
    return () => { cancelled = true; };
  }, [friendId, client, revision]);

  const startRun = useCallback(async () => {
    if (!player || !roster || live.current.paused) return;
    void audioRef.current?.unlock();
    vsOpen.current = false; setVs(null);
    const game = new Game(player, player.familyId as FamilyId, roster, randomSeed(), { generation });
    game.reducedMotion = live.current.reducedMotion;
    game.touch = window.matchMedia("(pointer: coarse)").matches;
    gameRef.current = game;
    clearInput(); setSummary(null); setCopied(false); setMenu(null); setPhase("playing");
    canvasRef.current?.focus();
  }, [player, roster, clearInput, generation]);

  const newCast = useCallback(async () => {
    if (!player || live.current.phase === "loading") return;
    const token = ++loadToken.current;
    setPhase("loading"); setStatus("Summoning a new cast of Friends…"); gameRef.current = null; live.current.phase = "loading";
    try {
      const cast = await loadRoster(createRng(randomSeed()), friendId, player.familyId as FamilyId);
      if (token !== loadToken.current) return;
      setRoster(cast); setPhase("title");
    } catch {
      if (token !== loadToken.current) return;
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
            else if (event.type === "boss") {
              vsOpen.current = true;
              setVs({ boss: event.enemy.sprites, floorName: game.theme.floorName, accent: game.theme.accent, key: now });
            } else if (event.type === "dead" || event.type === "won") {
              setSummary({ depth: game.depth, kills: game.kills, sparks: game.sparks, time: game.time, defeated: [...game.defeated], floors: game.floors });
              setPhase(event.type); clearInput();
              audioRef.current?.jingle(event.type === "won" ? "win" : "lose");
            }
          }
        }
        // The VS card closes when its freeze ends (timed out or skipped).
        if (vsOpen.current && game.intro <= 0) { vsOpen.current = false; setVs(null); }
        audioRef.current?.theme(state.phase === "playing" && game.status === "playing" ? game.cast.family : null, Boolean(game.boss), running);
        render(ctx, game, now);
        paintSticks(ctx);
      } else {
        ctx.fillStyle = "#070708"; ctx.fillRect(0, 0, VIEW_W, VIEW_H);
        audioRef.current?.theme(null, false, false);
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

  // Toast timer.
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(null), 2800); return () => clearTimeout(t); }, [toast]);

  // Keyboard, blur and visibility.
  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      const k = event.key.toLowerCase(), state = live.current;
      if (state.paused) return;
      audioRef.current?.wake();
      if (k === "m" && !event.repeat) { setMuted(value => !value); return; }
      if (state.phase === "playing" && !state.menu) {
        // Any key (except pause) skips the boss VS card.
        if (vsOpen.current && k !== "p" && k !== "escape" && !["shift", "control", "alt", "meta"].includes(k)) gameRef.current?.skipIntro();
        if (MOVE_KEYS.has(k)) { event.preventDefault(); input.current.keys.add(k); }
        if ((k === "p" || k === "escape") && !event.repeat) { event.preventDefault(); clearInput(); setMenu("pause"); }
      } else if (state.phase === "title" && !state.menu && k === "enter" && !event.repeat) { event.preventDefault(); void startRun(); }
    };
    const up = (event: KeyboardEvent) => input.current.keys.delete(event.key.toLowerCase());
    const blur = () => { clearInput(); if (live.current.phase === "playing" && !live.current.menu) setMenu("pause"); };
    const visibility = () => { audioRef.current?.setHidden(document.hidden); if (document.hidden) blur(); };
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
  const signature = useMemo(() => player ? signatureFor(player) : null, [player]);
  const bonus = generationBonus(generation);
  const id = String(friendId);
  const shareText = useMemo(() => {
    if (!summary || !player || !signature) return "";
    const who = `Friend #${id} (${player.familyName}, signature: ${signature.name})`;
    const what = phase === "won" ? `cleared ${summary.floors} floors` : `reached floor ${summary.depth + 1} of ${summary.floors}`;
    return `${who} ${what} and defeated ${summary.defeated.length} real Rare Friends in ${formatTime(summary.time)} — The Binding of RareFriend ${PREVIEW_URL}`;
  }, [summary, player, signature, phase, id]);
  const copyResult = async () => {
    let ok = false;
    // The sandbox may refuse clipboard access; the text stays selectable below either way.
    const policy = (document as Document & { permissionsPolicy?: { allowsFeature(name: string): boolean }; featurePolicy?: { allowsFeature(name: string): boolean } });
    const allowed = (policy.permissionsPolicy ?? policy.featurePolicy)?.allowsFeature("clipboard-write") ?? true;
    try { if (allowed && navigator.clipboard?.writeText) { await navigator.clipboard.writeText(shareText); ok = true; } } catch { ok = false; }
    if (!ok) {
      try { const area = shareRef.current; if (area) { area.focus(); area.select(); ok = document.execCommand("copy"); } } catch { ok = false; }
    }
    setCopied(ok);
  };

  return <section className="bor-game" aria-label="The Binding of RareFriend, a dungeon crawler">
    <canvas ref={canvasRef} width={VIEW_W} height={VIEW_H} className="bor-canvas" tabIndex={active ? 0 : -1}
      aria-label="Dungeon room. WASD to move, arrow keys or mouse to shoot. On touch, left thumb moves and right thumb shoots. P pauses, M mutes."
      onPointerDown={event => {
        if (!active) return;
        event.preventDefault(); event.currentTarget.focus();
        audioRef.current?.wake();
        if (vsOpen.current) { gameRef.current?.skipIntro(); return; }
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

    {toast && phase === "playing" && !vs && <div className="bor-toast" key={toast.key} role="status"><strong>{toast.title}</strong><span>{toast.text}</span></div>}
    {vs && player && phase === "playing" && !menu && <div className={`bor-vs${reducedMotion ? " still" : ""}`} key={vs.key} role="status"
      style={{ "--vs-accent": vs.accent } as React.CSSProperties}
      onPointerDown={event => { event.preventDefault(); if (!paused) { audioRef.current?.wake(); gameRef.current?.skipIntro(); } }}>
      <div className="bor-vs-side you">
        <Portrait sprites={player} scale={8} label={`Your Friend number ${id}`} legendary={bonus?.generation === 1} />
        <strong>Friend #{id}</strong><span>{player.familyName} family</span>{signature && <span>Signature: {signature.name}</span>}
        {bonus && <span className={`bor-vs-tier${bonus.generation === 1 ? " legendary" : ""}`}>Gen {bonus.generation} · {bonus.tier}</span>}
      </div>
      <div className="bor-vs-mid" aria-label="versus"><span>VS</span></div>
      <div className="bor-vs-side them">
        <Portrait sprites={vs.boss} scale={8} halo="#e0243f" label={`Boss Friend number ${vs.boss.tokenId}`} />
        <strong>Friend #{String(vs.boss.tokenId)}</strong><span>{vs.boss.familyName} family</span><span>Keeper of {vs.floorName}</span>
      </div>
      <small className="bor-vs-skip">{touch ? "Tap" : "Press any key"} to fight</small>
    </div>}

    {(phase === "loading" || phase === "error") && <div className="bor-screen" role={phase === "error" ? "alert" : "status"}>
      <h1 className="bor-logo">The Binding of <em>RareFriend</em></h1>
      <p>{status}</p>
      {phase === "loading" && <div className="bor-spinner" aria-hidden="true" />}
      {phase === "error" && <button type="button" className="bor-primary" disabled={paused} onClick={() => setRevision(value => value + 1)}>Retry</button>}
    </div>}

    {phase === "title" && player && roster && !menu && <div className="bor-screen bor-title">
      <h1 className="bor-logo">The Binding of <em>RareFriend</em></h1>
      <p className="bor-descent">The descent of Friend #{id}</p>
      <div className="bor-hero">
        <Portrait sprites={player} scale={8} label={`Your Friend number ${id}`} legendary={bonus?.generation === 1} />
        <div>
          <strong>Friend #{id}</strong>
          <span>{player.familyName} family{bonus ? ` · Generation ${bonus.generation} (${bonus.tier})` : ""}</span>
          <span className="bor-perk">Perk: <b>{PERKS[player.familyId as FamilyId].name}</b>. {PERKS[player.familyId as FamilyId].text}</span>
          {signature && <span className="bor-perk">Signature: <b>{signature.name}</b>. {signature.text}</span>}
          {bonus && <span className={`bor-perk bor-tier${bonus.generation === 1 ? " legendary" : ""}`}>{generationLabel(bonus)}</span>}
        </div>
      </div>
      <p className="bor-intro">Four floors down, every Friend in the crypt is real. Only one of them is yours.</p>
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

    {(phase === "dead" || phase === "won") && summary && player && !menu && <div className={`bor-screen bor-end ${phase}`} role="status">
      <h1 className="bor-logo">{phase === "won" ? "You escaped!" : "You were bound."}</h1>
      {phase === "won" && <Portrait sprites={player} scale={6} halo="#ccff00" label={`Your Friend number ${id}, victorious`} />}
      <p className="bor-descent">{phase === "won" ? `The crypt remembers Friend #${id}.` : `The crypt keeps Friend #${id}, until the next descent.`}</p>
      <p>{phase === "won" ? `Friend #${id} broke free of all ${summary.floors} floors, and every keeper bowed.` : `Friend #${id} fell on floor ${summary.depth + 1}, ${THEMES[roster!.floors[summary.depth].family].floorName}.`}</p>
      <p className="bor-stats">{summary.kills} kills · {summary.sparks} sparks · {formatTime(summary.time)}{signature ? ` · ${signature.name}` : ""}</p>
      {summary.defeated.length > 0 && <>
        <h2>{phase === "won" ? `They bow to Friend #${id} (${summary.defeated.length})` : `Friends you defeated (${summary.defeated.length})`}</h2>
        <ul className={`bor-gallery${phase === "won" ? " bow" : ""}${reducedMotion ? " still" : ""}`}>
          {summary.defeated.slice(0, 24).map((entry, index) => <li key={String(entry.id)} className={entry.boss ? "boss" : ""} style={{ animationDelay: `${(index % 12) * 0.08}s` }}>
            <Portrait sprites={entry.sprites} scale={2} halo={entry.boss ? "#e0243f" : THEMES[entry.family].accent} label={`Friend number ${entry.id}`} />
            <small>#{String(entry.id)}</small>
          </li>)}
        </ul>
      </>}
      <div className="bor-share">
        <textarea ref={shareRef} readOnly value={shareText} rows={3} aria-label="Your run result, ready to copy" onFocus={event => event.currentTarget.select()} />
        <button type="button" disabled={paused} onClick={() => void copyResult()}>{copied ? "Copied ✓" : "Copy result"}</button>
      </div>
      <div className="bor-actions">
        <button type="button" className="bor-primary" disabled={paused} onClick={() => void startRun()}>Run it back</button>
        <button type="button" disabled={paused} onClick={() => void newCast()}>New cast</button>
      </div>
    </div>}

    {menu === "pause" && <GameMenu title="Paused" onClose={() => setMenu(null)}>
      <p>Floor {(gameRef.current?.depth ?? 0) + 1} · {gameRef.current?.theme.floorName}</p>
      <label><input type="checkbox" checked={muted} disabled={paused} onChange={event => setMuted(event.target.checked)} /> Mute sound</label>
      <label><input type="checkbox" checked={musicOn} disabled={paused} onChange={event => setMusicOn(event.target.checked)} /> Music</label>
      <label><input type="checkbox" checked={reducedMotion} disabled={paused} onChange={event => setReducedMotion(event.target.checked)} /> Reduce motion</label>
      <div className="bor-menu-actions">
        <button type="button" className="rf-frame-primary" disabled={paused} onClick={() => { audioRef.current?.wake(); setMenu(null); }}>Resume</button>
        <button type="button" disabled={paused} onClick={() => { gameRef.current = null; setMenu(null); setPhase("title"); }}>Quit run</button>
      </div>
      <p className="bor-small">No RF is spent or won. Progress lasts for this run only.</p>
    </GameMenu>}
    {menu === "settings" && <GameMenu title="Settings" onClose={() => setMenu(null)}>
      <label><input type="checkbox" checked={muted} disabled={paused} onChange={event => setMuted(event.target.checked)} /> Mute sound</label>
      <label><input type="checkbox" checked={musicOn} disabled={paused} onChange={event => setMusicOn(event.target.checked)} /> Music (a chiptune theme per floor)</label>
      <label><input type="checkbox" checked={reducedMotion} disabled={paused} onChange={event => setReducedMotion(event.target.checked)} /> Reduce motion (no shake, fades or bobbing; still sprite frames)</label>
      <p className="bor-small">Every enemy and boss is a real Rare Friends Generations token, drawn from its canonical on-chain artwork. Each run samples a new cast. Play is free: no RF purchases or rewards.</p>
      <button type="button" className="rf-frame-primary" disabled={paused} onClick={() => setMenu(null)}>Back</button>
    </GameMenu>}
  </section>;
}
