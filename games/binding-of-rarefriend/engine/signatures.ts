/**
 * Every Friend plays a little differently: a signature ability derived deterministically from its
 * canonical sprite seed and token ID, plus a rank-ladder bonus from its Generations generation (1 = rarest = strongest).
 * Both stack with the family perk and with relics. Presentation and run-only gameplay; no RF involved.
 */
import type { GenerationSprites } from "@rarefriends/friendsdk/sprites";

export type SignatureId = "ricochet" | "boomerang" | "orbit" | "chain" | "crit" | "leech" | "trail" | "fifth";
export type Signature = Readonly<{ id: SignatureId; name: string; text: string }>;

export const SIGNATURES: readonly Signature[] = [
  { id: "ricochet", name: "Ricochet", text: "Shots bounce off walls and rocks once." },
  { id: "boomerang", name: "Boomerang", text: "Shots fly out, turn around and hit again on the way back." },
  { id: "orbit", name: "Orbit Shard", text: "A shard circles you, cutting Friends and blocking shots." },
  { id: "chain", name: "Chain Spark", text: "Each hit arcs to the nearest other Friend for half damage." },
  { id: "crit", name: "Critical Eye", text: "12% of hits deal triple damage." },
  { id: "leech", name: "Heart Leech", text: "4% of kills drop a half heart; bosses drop an extra heart." },
  { id: "trail", name: "Trailblazer", text: "Moving leaves a short trail of pixels that burns Friends." },
  { id: "fifth", name: "Fifth Shot", text: "Every fifth shot is bigger, stronger and pierces." },
];

/** 32-bit avalanche mix (murmur3 finaliser). */
function mix(h: number) {
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
}

/** Same Friend, same signature, on every device: a hash of the canonical sprite seed and the token ID. */
export function signatureIndex(tokenId: bigint, seed: number) {
  const low = Number(tokenId & 0xffffffffn), high = Number((tokenId >> 32n) & 0xffffffffn);
  return mix(mix(low ^ Math.imul(seed >>> 0, 0x9e3779b1)) ^ high) % SIGNATURES.length;
}

export function signatureFor(sprites: Pick<GenerationSprites, "tokenId" | "seed">): Signature {
  return SIGNATURES[signatureIndex(sprites.tokenId, sprites.seed)];
}

export function signatureById(id: SignatureId): Signature {
  return SIGNATURES.find(signature => signature.id === id)!;
}

/** Gold used for the Legendary (generation 1) label and player outline. */
export const LEGENDARY_GOLD = "#ffd23f";

export type GenerationTier = "Legendary" | "Epic" | "Rare" | "Uncommon" | "Common" | "Standard";
/** hearts: extra hearts (2 HP each); damage / fireRate: multipliers. Lower generation = stronger. */
export type GenerationBonus = Readonly<{ generation: number; tier: GenerationTier; text: string; hearts: number; damage: number; fireRate: number }>;

const LADDER: readonly Omit<GenerationBonus, "generation">[] = [
  { tier: "Legendary", text: "+1 heart, +15% dmg, +10% fire rate", hearts: 1, damage: 1.15, fireRate: 1.1 },
  { tier: "Epic", text: "+1 heart, +10% dmg", hearts: 1, damage: 1.1, fireRate: 1 },
  { tier: "Rare", text: "+10% dmg, +5% fire rate", hearts: 0, damage: 1.1, fireRate: 1.05 },
  { tier: "Uncommon", text: "+10% dmg", hearts: 0, damage: 1.1, fireRate: 1 },
  { tier: "Common", text: "+5% dmg", hearts: 0, damage: 1.05, fireRate: 1 },
  { tier: "Standard", text: "no bonus", hearts: 0, damage: 1, fireRate: 1 },
];

/** Rank ladder: generation 1 (rarest) is strongest, 6 and later get none. Unknown or failed reads give null, never a blocked run. */
export function generationBonus(generation: number | null | undefined): GenerationBonus | null {
  if (!generation || !Number.isInteger(generation) || generation < 1) return null;
  return { generation, ...LADDER[Math.min(generation, 6) - 1] };
}

/** Short label, e.g. "GEN 1 · LEGENDARY: +1 heart, +15% dmg, +10% fire rate". */
export function generationLabel(bonus: GenerationBonus) {
  return `GEN ${bonus.generation} · ${bonus.tier.toUpperCase()}: ${bonus.text}`;
}
