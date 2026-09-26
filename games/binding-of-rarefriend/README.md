# The Binding of RareFriend

*made by Fablizio* · FriendSDK **v0.1.2** · Rare Friends Vibeathon (Character Spotlight)

A twin-stick, room-by-room dungeon crawler in the spirit of the classic roguelites. **Your verified
Generations Friend is the hero**, drawn from its canonical on-chain sprite, and its family gives it a
signature perk. **Every enemy and boss is another real Rare Friend** (token ID shown on screen), read
live from the SDK's pinned artwork registry on Robinhood Chain. Each floor belongs to one of the nine
Generations families, which sets the floor's look, obstacles and enemy behaviour. Floor 1 is always
your own family's turf.

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

Settings (title screen) and the pause menu include **Mute** and **Reduce motion** (no screen shake,
room fades, bobbing or walk cycles). Losing focus or hiding the tab pauses the run, and the game
freezes whenever the runtime opens its own menus.

## Rules

- A run is **4 floors**. Each floor is a grid of single-screen rooms: a start room, fights, one
  **treasure room** (gold door) and a **boss room** (red door, farthest from the start).
- Doors lock until every Friend in the room is defeated. Clearing a room may drop a heart or a spark.
- Beat the floor's boss (the keeper, a real Friend at 6× size) to get a relic, a heart and the hatch
  down. The last boss opens the way out.
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

## How the Friends are chosen

At the start of each run (and on **New cast**), the game samples 120 random token IDs from
1–100,000, the range where hardwired Generations Friends live, and reads each ID's family from the
SDK's pinned sprite registry (`familyOf`). It then groups them into floors and reads `seedOf` and the
64 canonical frames (`frames`) of up to six Friends per floor. Reads go through one Multicall3 call per step, with a fallback
to individual JSON-RPC batched reads. Only the public **artwork registry** is read. The Generations
collection is never scanned, no owners are looked up, and nothing depends on who holds those Friends.
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

- `npx friendsdk check games/binding-of-rarefriend`: game validation.
- `npx tsc -p games/binding-of-rarefriend/tsconfig.json`: strict typecheck.
- `node games/binding-of-rarefriend/tests/run-sim.mjs`: headless bot plays 54 full runs (all nine
  player families, invulnerable and normal) and flags any room it cannot clear.
- `node games/binding-of-rarefriend/tests/browser.mjs`: real SDK runtime in headless Chromium with the
  SDK's mock wallet and RPC fixtures, extended to answer the artwork registry and Multicall3 for many
  IDs. Checks desktop, phone landscape and phone portrait for browser errors and takes screenshots.
- `node games/binding-of-rarefriend/tests/run-visual.mjs`: renders mid-combat and boss frames for
  several themes.

The stock `npx friendsdk test` fixture only answers artwork reads for sample Friend #7730, so it
rejects this game's roster reads by design. The custom browser check above covers that path.
Mock identities and sample sprites are used only in these tests. The real ownership gate needs a
real-wallet playtest.

## Credits

Code, level design, rooms, props and sound effects by Fablizio (AI-assisted). All scenery is drawn
from code and all sounds are synthesized from code. Character artwork: canonical Rare Friends
Generations sprites via the FriendSDK sprite reader (see the SDK `NOTICE.md`). Reward cues come
from the FriendSDK sound kit. Inspired by the room-based twin-stick roguelite genre. Not affiliated
with any other game.
