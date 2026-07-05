// Offsets are rounded to whole pixels, so a box can appear to end up to a
// pixel and a half below where the next line starts.
export const TOLERANCE = 2;

/**
 * Groups measured boxes into lines and returns, for every line, the index of
 * the item it starts with.
 *
 * A box starts a new line when it begins at or below the bottom of the line
 * so far. Comparing tops alone would not do: boxes of different font sizes
 * sit on a shared baseline, so their tops differ within one line.
 */
export function computeLineStarts(
  tops: ArrayLike<number>,
  heights: ArrayLike<number>,
  itemIndexes: ArrayLike<number>,
  count: number,
): number[] {
  const starts = [0];
  let bottom = 0;
  let seen = false;
  for (let i = 0; i < count; i++) {
    const height = heights[i]!;
    // Nothing rendered (an empty atom, for instance): it can't tell us anything.
    if (height <= 0) continue;
    const top = tops[i]!;
    if (!seen) {
      seen = true;
      bottom = top + height;
    } else if (top >= bottom - Math.min(TOLERANCE, height / 2)) {
      starts.push(itemIndexes[i]!);
      bottom = top + height;
    } else if (top + height > bottom) {
      bottom = top + height;
    }
  }
  return starts;
}

export function sameStarts(a: readonly number[] | null, b: readonly number[] | null): boolean {
  if (a === b) return true;
  if (!a || !b || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}
