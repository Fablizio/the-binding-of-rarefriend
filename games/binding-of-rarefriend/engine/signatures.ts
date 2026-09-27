/**
 * Every Friend plays a little differently: a signature ability derived deterministically from its
 * canonical sprite seed and token ID, plus a small bonus from its Generations generation (1 = rarest).
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

export type GenerationBonus = Readonly<{ generation: number; text: string }>;

/** Generation 1 is the rarest. Unknown or failed reads give no bonus (null), never a blocked run. */
export function generationBonus(generation: number | null | undefined): GenerationBonus | null {
  if (!generation || !Number.isInteger(generation) || generation < 1) return null;
  const text = generation === 1 ? "+1 heart"
    : generation === 2 ? "+15% damage"
    : generation === 3 ? "+10% fire rate"
    : generation === 4 ? "+10% speed"
    : generation === 5 ? "+15% shot range"
    : "+5% damage";
  return { generation, text };
}
