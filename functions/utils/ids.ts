// functions/utils/ids.ts
//
// Hard, non-sequential, non-guessable content IDs.
// Shared globally across posts, group_posts, events, songs, stories, products.
// Fits in JS safe-integer range (< 2^53).

export function newContentId(): number {
  // hi: 21 bits (0 .. 2,097,151)
  // lo: 32 bits (0 .. 4,294,967,295)
  // product < 2^53
  const hi = Math.floor(Math.random() * 0x200000);
  const lo = Math.floor(Math.random() * 0x100000000);
  return hi * 0x100000000 + lo;
}

/**
 * Attempt an insert with a fresh random content id.
 * Retries up to `maxAttempts` if the DB reports a PK/UNIQUE conflict.
 * Returns { id, result } on success.
 */
export async function withNewContentId<T>(
  run: (id: number) => Promise<T>,
  maxAttempts = 5,
): Promise<{ id: number; result: T }> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const id = newContentId();
    try {
      const result = await run(id);
      return { id, result };
    } catch (e: any) {
      const msg = String(e?.message || "");
      const isConflict =
        msg.includes("UNIQUE constraint failed") ||
        msg.includes("PRIMARY KEY") ||
        msg.includes("constraint failed");
      if (!isConflict) throw e;
    }
  }
  throw new Error("Failed to allocate unique content id after max attempts");
}
