import { describe, expect, it } from 'vitest';
import { computeLineStarts, sameStarts } from '../../src/lines';

/** Each box is [top, height]; item indexes are 10, 11, 12... */
function starts(boxes: [number, number][]): number[] {
  return computeLineStarts(
    boxes.map(([top]) => top),
    boxes.map(([, height]) => height),
    boxes.map((_, i) => 10 + i),
    boxes.length,
  );
}

describe('computeLineStarts', () => {
  it('always starts the first line at the first item', () => {
    expect(starts([])).toEqual([0]);
    expect(starts([[0, 20]])).toEqual([0]);
  });

  it('starts a line wherever a box sits below the line so far', () => {
    expect(
      starts([
        [0, 20],
        [0, 20],
        [20, 20],
        [40, 20],
        [40, 20],
      ]),
    ).toEqual([0, 12, 13]);
  });

  it('keeps boxes of different sizes on one line when they share a baseline', () => {
    expect(
      starts([
        [28, 10], // small word first
        [0, 40], // big word, same line
        [30, 12], // subscript hanging a little below
        [42, 40], // next line
      ]),
    ).toEqual([0, 13]);
  });

  it('tolerates offsets that were rounded to whole pixels', () => {
    // 10.5 + 19.5 = 30, reported as 11 + 20 = 31; the next line is at 30.
    expect(
      starts([
        [11, 20],
        [30, 20],
      ]),
    ).toEqual([0, 11]);
  });

  it('still tells very short lines apart', () => {
    expect(
      starts([
        [0, 3],
        [3, 3],
        [6, 3],
      ]),
    ).toEqual([0, 11, 12]);
  });

  it('ignores boxes that are not rendered', () => {
    expect(
      starts([
        [0, 20],
        [0, 0],
        [20, 20],
      ]),
    ).toEqual([0, 12]);
    // Nothing is laid out at all: every offset is zero.
    expect(
      starts([
        [0, 0],
        [0, 0],
      ]),
    ).toEqual([0]);
  });
});

describe('sameStarts', () => {
  it('compares by value', () => {
    expect(sameStarts([0, 3], [0, 3])).toBe(true);
    expect(sameStarts([0, 3], [0, 4])).toBe(false);
    expect(sameStarts([0], [0, 1])).toBe(false);
    expect(sameStarts(null, [0])).toBe(false);
    expect(sameStarts(null, null)).toBe(true);
  });
});
