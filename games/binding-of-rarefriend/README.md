# The Binding of RareFriend

![Gameplay demo: a Hoverer Friend with the Chain Spark signature fights a floor's elite, then its boss (recorded with SDK sample sprites)](media/demo.gif)

![The boss VS card: your Friend against the floor's keeper](media/vs.png)

Builder: Fablizio · [GitHub @Fablizio](https://github.com/Fablizio) · [X @FabrizioCottone](https://x.com/FabrizioCottone) · [Telegram @Fablizio](https://t.me/Fablizio) · FriendSDK **v0.1.2** · Rare Friends Vibeathon (Character Spotlight)

A twin-stick, room-by-room dungeon crawler in the spirit of the classic roguelites. **Your verified
Generations Friend is the hero**, drawn from its canonical on-chain sprite, and its family gives it a
signature perk. **Every enemy and boss is another real Rare Friend** (token ID shown on screen), read
live from the SDK's pinned artwork registry on Robinhood Chain. Each floor belongs to one of the nine
Generations families, which sets the floor's look, obstacles and enemy behaviour. Floor 1 is always
your own family's turf.

No two Friends play the same: on top of the family perk, **each Friend has its own signature ability**,
derived from its canonical sprite seed and token ID, and a small **generation bonus** read from its
Generations generation. The run is framed as *the descent of Friend #ID*: the title card puts your Friend
front and centre, and on victory every Friend you defeated bows to yours ("The crypt remembers Friend
#ID"). The end screen has a **Copy result** line to share.

## Run it

From the SDK root (Node.js 22+):

```sh
npm ci
npm run build
npm run dev:game -- games/binding-of-rarefriend
```

Open `http://localhost:4173`, choose **Connect wallet**, switch to Robinhood mainnet if asked, pick an
owned hardwired Friend (generation ≥ 1) and press **Enter the dungeon**. Static build:
`npx friendsdk build games/binding-of-rarefriend` → `games/binding-of-rarefriend/.friendsdk/`.

**Wallet and network:** a browser wallet on **Robinhood mainnet (chain 4663)** holding a hardwired
Generations NFT. The SDK runtime handles connection, Friend selection and the fresh ownership check.
No transaction or signature is ever requested.

## Controls

| | Keyboard / mouse | Touch (hold the phone sideways) |
| --- | --- | --- |
| Move | WASD | Left thumb: drag anywhere on the left half |
| Shoot | Arrow keys (4 directions) or hold the left mouse button (aims at the cursor) | Right thumb: drag anywhere on the right half |
| Pause | P or Esc, or the **II** button | **II** button |
| Mute | M, or the **♪** button | **♪** button |

Settings (title screen) and the pause menu include **Mute**, **Music** (on by default) and **Reduce
motion** (no screen shake, room fades, bobbing, walk cycles or VS-card slide). Losing focus or hiding
the tab pauses the run and silences the music, and the game freezes whenever the runtime opens its own
menus.

## Rules

- A run is **4 floors**. Each floor is a grid of single-screen rooms: a start room, fights, one
  **treasure room** (gold door) and a **boss room** (red door, farthest from the start).
- Doors lock until every Friend in the room is defeated. Clearing a room may drop a heart or a spark.
- Each floor has one **elite room** (gold diamond on the minimap), the normal room farthest from the
  start, in an arena layout. Its **elite** is a real Friend of the floor's family at 4× size with a gold
  halo, a health bar, more health and one extra family move (table below). It always drops a reward: a
  heart if you are hurt, otherwise a bundle of three sparks.
- Entering a boss room shows a **VS card**: your Friend (family, signature) against the keeper (a real
  Friend at 6× size). The room is frozen while it shows (about 2.4 s); any key or a tap skips it. With
  reduced motion it is a static card.
- Beat the floor's boss (the keeper) to get a relic, a heart and the hatch down. The last boss opens
  the way out.
- You start with 3 hearts. Contact and enemy shots cost half a heart (bosses a full heart from
  floor 2). Brief invulnerability follows each hit. Zero hearts ends the run.
- Relics (treasure rooms and bosses) stack: Bone Marrow (+1 heart), Spare Mask (+damage), Family
  Photo (familiar), Petri Dish (split shots), Crooked Lens (fire rate), Hover Boots (flight), Colossal
  Knuckle (big shots), Sparkle Dust (shot speed and range), Hollow Heart (speed, invulnerability),
  Signal Green (homing).
- Sparks are score only. The end screen lists every real Friend you faced, by token ID.

### Your family perk

| Family | Perk |
| --- | --- |
| Skeleton | Piercing shots |
| Mask | Twin parallel shots |
| Family | Starts with a mini-me familiar |
| Cellular | Shots split on hit |
| Asymmetry | Wobbly shots, +25% damage |
| Hoverer | Flight over pits and rocks |
| Colossus | +1 heart, huge shots, slower |
| Sparkling | Every 6th shot bursts in 8 directions |
| Hollow | Longer invulnerability, faster |

### Your Friend's signature

Every Friend also gets one of eight signature abilities. It is picked by a deterministic hash of the
Friend's canonical sprite seed and token ID (`engine/signatures.ts`), so the same Friend always has the
same signature on every device, and the eight are spread evenly across token IDs (about 12.5% each). The
signature is shown on the title card and in the HUD's bottom line, and it stacks with the family perk
and with relics (for example Ricochet with piercing Skeleton shots, or Chain Spark with Mask's twin shots).

| Signature | Effect |
| --- | --- |
| Ricochet | Shots bounce off walls and rocks once. |
| Boomerang | Shots fly out, turn around (or turn at a wall) and hit again on the way back. |
| Orbit Shard | A shard circles you, cutting Friends it touches and blocking enemy shots. |
| Chain Spark | Each hit arcs to the nearest other Friend (within range) for half damage. |
| Critical Eye | 12% of hits deal triple damage, with a CRIT flash. |
| Heart Leech | 4% of kills drop a half heart; each boss drops an extra heart. |
| Trailblazer | Moving leaves a short trail of pixels that burns Friends standing on it. |
| Fifth Shot | Every fifth shot is bigger, deals 60% more damage and pierces. |

### Generation bonus

The game reads your own Friend's `generation(tokenId)` once from the Generations contract
(`0x14C4…181D` on Robinhood Chain), the same value the runtime's eligibility check uses. It is a single
read of your verified Friend, never a scan. If the read fails or times out, no bonus is shown and the run
plays normally.

| Generation | Bonus |
| --- | --- |
| 1 (rarest) | +1 heart |
| 2 | +15% damage |
| 3 | +10% fire rate |
| 4 | +10% speed |
| 5 | +15% shot range |
| 6 and later | +5% damage |

### Sharing a run

The victory and death screens show a one-line result, for example *"Friend #25090 (Hoverer, signature:
Ricochet) cleared 4 floors and defeated 23 real Rare Friends in 12:31 — The Binding of RareFriend
https://fablizio.github.io/the-binding-of-rarefriend/"*. **Copy result** tries the clipboard (the sandbox
may refuse it); the text is always shown in a selectable box so it can be copied by hand. "Copied ✓"
appears only when copying succeeded.

### Floors and enemies

| Family | Floor | Enemy behaviour |
| --- | --- | --- |
| Skeleton | The Ossuary | Rattlers chase you around obstacles |
| Mask | Masquerade Hall | Mimics keep distance, shoot and blink away |
| Family | The Old House | Kin come in threes and lunge |
| Cellular | Culture Vats | Cells split into two smaller cells |
| Asymmetry | The Crooked Wing | Glitches zigzag and fire diagonal shots |
| Hoverer | Cloud Cellar | Drifters fly over pits and rocks |
| Colossus | Colossus Quarry | Brutes charge when you line up |
| Sparkling | Glimmer Mines | Glints burst rings of shots |
| Hollow | The Hollow | Shades vanish and reappear next to you |

Bosses mix three family attacks (rings, aimed spreads, charges, summons, spirals, blinks, slams) and
speed up below half health.

### Elites

| Family | Elite's extra move |
| --- | --- |
| Skeleton | Raises two Rattlers once, when wounded |
| Mask | Fires a fan of five shots after every blink |
| Family | Calls two Kin every few seconds (at most four helpers) |
| Cellular | Splits into three cells instead of two |
| Asymmetry | Every shot is mirrored into a full X |
| Hoverer | Rises, then dives at where you stood |
| Colossus | A charge that hits a wall ends in a shockwave ring |
| Sparkling | Bursts in a double ring |
| Hollow | Leaves a harmless decoy when it fades out |

### Rooms

31 hand-made layouts: the 13 original ones (one is the empty room), 9 new ones (asymmetric rocks and pits, lanes, stepping
stones, and three open arenas used for elite rooms) and one themed layout per family (Skeleton
ribcage, Mask face, Family dinner table, Cellular cells, Asymmetry crooked line, Hoverer open sky,
Colossus boulders, Sparkling crystal field, Hollow void rifts). Themed layouts appear twice as often
on their own family's floor. Every layout is randomly mirrored, door approaches are forced clear, and
each generated room is checked for connectivity (the sim also checks every layout).

### Music

Every floor has its own looping chiptune, synthesized in code with WebAudio (square/triangle lead and
bass, noise drums; no samples or files). The Ossuary is a slow harmonic-minor walk, Masquerade Hall a
3/4 waltz, The Old House warm major, Culture Vats bubbly pentatonic staccato, The Crooked Wing dorian in
7/8, Cloud Cellar airy lydian, Colossus Quarry heavy slow phrygian, Glimmer Mines sparkly major
arpeggios and The Hollow sparse whole-tone. Boss rooms play a faster variant a semitone higher with
driving bass and busier drums. Victory plays a short jingle and death a falling sting. Notes are
scheduled ahead on the AudioContext clock (a 60 ms timer, 160 ms lookahead). Floors crossfade, and the
music sits under the sound effects. It starts only after **Enter the dungeon** and stops while
paused, in a menu or when the tab is hidden (the audio context is suspended then). It follows **Mute**
and has its own **Music** toggle.

## How the Friends are chosen

At the start of each run (and on **New cast**), the game samples 120 random token IDs from
1–100,000, the range where hardwired Generations Friends live, and reads each ID's family from the
SDK's pinned sprite registry (`familyOf`). It then groups them into floors and reads `seedOf` and the
64 canonical frames (`frames`) of up to six Friends per floor. Reads go through one Multicall3 call per step, with a fallback
to individual JSON-RPC batched reads. Only the public **artwork registry** is read for other Friends (plus one `generation` read of your
own Friend for its bonus). The Generations collection is never scanned, no owners are looked up, and nothing depends on who holds those Friends.
Enemy art is the unmodified canonical 16×16 mask at integer scale with a family-coloured halo. The
player keeps the canonical black mask and white halo.

## Economy

**Play is free: 0 RF.** There are no purchases, consumables or rewards, and nothing is simulated as
RF. Sparks and relics are run-only and reset on reload. The SDK v0.1.2 runtime still requires a
chance-game `game.json`, so this directory includes **unused schema-only terms** (a 1 RF token with a
single 100% / 10,000 bps reward of 1 RF, both `1000000000000000000` base units). The component never
calls `buy`, `play`, `settle` or `redeem`.

Future RF ideas, not implemented: an RF-priced "second chance" heart, RF-backed cosmetic halos
for your Friend, and a weekly seeded "daily crypt" with an RF-funded prize pool. Each would need
custom integration beyond the v0.1.2 bridge, which has no persistence, upgrade or extra-currency APIs.

## Checks

Run from the SDK root. All of these were run for the current version and pass.

- `npx friendsdk check games/binding-of-rarefriend`: game validation.
- `npx tsc -p games/binding-of-rarefriend/tsconfig.json`: strict typecheck.
- `node games/binding-of-rarefriend/tests/run-sim.mjs`: checks that all 31 layouts are 13×7 and
  fully connected, and that 300 generated floors each have an elite room (with no fallback to an
  empty room). It checks that signatures are deterministic and evenly spread over 20,000 token IDs.
  Then a headless bot plays 54 full runs (all nine player families, invulnerable and normal, cycling
  through all eight signatures and generation bonuses) and 72 more balance runs (every signature with
  the same nine seeds). It fails on any room the bot cannot clear, elite and boss rooms included.
  Latest result: the invulnerable bot cleared 27/27 runs. The simple normal bot reaches floor 2.0–2.6
  on average with every signature, and dies mostly to bosses (elites killed it once in 27 runs).
- `node games/binding-of-rarefriend/tests/browser.mjs`: real SDK runtime in headless Chromium with the
  SDK's mock wallet and RPC fixtures, extended to answer the artwork registry and Multicall3 for many
  IDs (the fixture reports generation 1). Checks desktop, phone landscape and phone portrait for browser
  errors, including the music scheduler. It covers the title card, an elite room (arena layout, one
  elite), the boss **VS card** (the room must stay frozen behind it and a key or tap must skip it), the
  victory and death screens and the **Copy result** text and button. It takes screenshots
  (`media/vs.png` comes from it).
- `node games/binding-of-rarefriend/tests/run-visual.mjs`: renders mid-combat and boss frames for
  several themes.
- `node games/binding-of-rarefriend/tests/run-demo.mjs`: renders `media/demo.gif` frame by frame
  (a floor-2 elite room, then the boss; bot at the controls, SDK sample sprites as stand-ins for real
  Friends) and converts it with ffmpeg. The GIF is canvas-only, so it has no VS card or music.
  `media/title.png` is the desktop title screenshot from the browser check (fixture Friend #7730).

The stock `npx friendsdk test` fixture only answers artwork reads for sample Friend #7730, so it
rejects this game's roster reads by design. The custom browser check above covers that path.
Mock identities and sample sprites are used only in these tests. The real ownership gate needs a
real-wallet playtest.

## Credits

Code, level design, rooms, props and sound effects by Fablizio (AI-assisted). All scenery is drawn
from code, and all sounds and music are synthesized from code. Character artwork: canonical Rare Friends
Generations sprites via the FriendSDK sprite reader (see the SDK `NOTICE.md`). Reward cues come
from the FriendSDK sound kit. Inspired by the room-based twin-stick roguelite genre. Not affiliated
with any other game.
