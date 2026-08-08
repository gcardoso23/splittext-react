import type { SplitAnimation, SplitEffect } from './types';

/** Where an animation had got to when the elements it ran on were replaced. */
export interface Carried {
  time: number;
  done: boolean;
}

function isAnimation(effect: SplitEffect): effect is SplitAnimation {
  return (
    typeof effect === 'object' &&
    effect !== null &&
    typeof effect.revert === 'function' &&
    typeof effect.totalTime === 'function'
  );
}

/** Undoes what an `onSplit` set up, and tells where its animation had got to. */
export function undo(effect: SplitEffect): Carried | null {
  if (typeof effect === 'function') {
    effect();
    return null;
  }
  if (!isAnimation(effect)) return null;
  const carried = {
    time: effect.totalTime(),
    done: typeof effect.progress === 'function' && effect.progress() === 1,
  };
  // Reverted before the next one is made: an animation that starts from
  // where an element is would otherwise start from where this one left it.
  effect.revert();
  return carried;
}

/**
 * Starts an animation made for new elements where the one it replaces had
 * got to. One that had finished leaves the new elements finished too, even
 * when there are more of them and the new one is longer.
 */
export function resume(effect: SplitEffect, carried: Carried | null): void {
  if (!carried || !isAnimation(effect)) return;
  if (carried.done) effect.progress(1);
  else effect.totalTime(carried.time);
}
