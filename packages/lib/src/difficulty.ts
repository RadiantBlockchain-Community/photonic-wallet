const IDEAL_BLOCK_TIME = 300;
const HALF_LIFE = 2n * 24n * 3600n;
const HALF_LIFE_V2 = 12n * 3600n; // 12 hours, activated at ASERT_HALF_LIFE_UPGRADE_HEIGHT
export const ASERT_HALF_LIFE_UPGRADE_HEIGHT = 410000;
const RBITS = 16n;
const RADIX = 1n << RBITS;
const MAX_BITS = 0x1d00ffff;
const MAX_TARGET = bitsToTarget(MAX_BITS);

export { HALF_LIFE_V2 };

export function nextBitsAserti32D(
  anchorBits: number,
  timeDiff: number,
  heightDiff: number,
  halfLife?: bigint
): number {
  const hl = halfLife ?? HALF_LIFE;
  let target = bitsToTarget(anchorBits);
  let exponent =
    ((BigInt(timeDiff) - BigInt(IDEAL_BLOCK_TIME) * (BigInt(heightDiff) + 1n)) *
      RADIX) /
    hl;
  const shifts = exponent >> RBITS;
  exponent -= shifts * RADIX;

  if (exponent < 0 || exponent >= 65536) {
    throw new Error("Exponent out of range");
  }

  target *=
    RADIX +
    ((195766423245049n * exponent +
      971821376n * exponent ** 2n +
      5127n * exponent ** 3n +
      2n ** 47n) >>
      (RBITS * 3n));

  if (shifts < 0) {
    target >>= -shifts;
  } else {
    target <<= shifts;
  }

  target >>= RBITS;

  if (target === 0n) {
    return targetToBits(1n);
  }

  if (target > MAX_TARGET) {
    return MAX_BITS;
  }

  return targetToBits(target);
}

export function targetToBits(target: bigint): number {
  if (target <= 0n) {
    throw new Error("Target must be greater than 0");
  }

  if (target > MAX_TARGET) {
    console.warn(
      `Warning: target went above maximum (${target} > ${MAX_TARGET})`
    );
    target = MAX_TARGET;
  }

  let size = Math.floor(Number((target.toString(2).length + 7) / 8));
  const mask64 = 0xffffffffffffffffn;

  let compact: bigint;
  if (size <= 3) {
    compact = (target & mask64) << (8n * BigInt(3 - size));
  } else {
    compact = (target >> (8n * BigInt(size - 3))) & mask64;
  }

  if (compact & 0x00800000n) {
    compact >>= 8n;
    size += 1;
  }

  if (compact !== (compact & 0x007fffffn) || size >= 256) {
    throw new Error("targetToBits failed");
  }

  return Number(compact | (BigInt(size) << 24n));
}

export function bitsToTarget(bits: number) {
  const size = BigInt(bits) >> 24n;
  const word = bits & 0x00ffffff;

  if (size <= 3n) return BigInt(word) >> (8n * (3n - size));
  else return BigInt(word) << (8n * (size - 3n));
}
