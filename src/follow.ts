import { resume, undo, type Carried } from './animation';
import type { SplitCallback, SplitEffect, SplitResult } from './types';
import { warn } from './warn';

interface Follower {
  readonly onSplit: SplitCallback;
  effect: SplitEffect;
  carried: Carried | null;
}

const followers = new WeakMap<Element, Set<Follower>>();
// The split each root is showing, for followers that come late.
const current = new WeakMap<Element, () => SplitResult>();

function run(follower: Follower, result: SplitResult): void {
  follower.effect = follower.onSplit(result);
  resume(follower.effect, follower.carried);
  follower.carried = null;
}

/**
 * Tells the root's followers about a split, before paint. The function it
 * returns undoes what they set up, when the split is replaced or the root
 * goes away.
 */
export function publish(root: HTMLElement, read: () => SplitResult): () => void {
  current.set(root, read);
  const set = followers.get(root);
  // A copy: a follower added by another one is run once, when it is added.
  if (set) for (const follower of Array.from(set)) run(follower, read());
  return () => {
    if (current.get(root) === read) current.delete(root);
    const set = followers.get(root);
    if (!set) return;
    for (const follower of set) {
      follower.carried = undo(follower.effect);
      follower.effect = undefined;
    }
  };
}

/**
 * Follows a `<SplitText>` from outside React, for code that finds the text
 * in the document: a page's entrance, a scroll-triggered reveal.
 *
 * `onSplit` is called with the elements right away if the text is split
 * already, or as soon as it is, and again each time the lines change. What
 * it returns is handled as `onSplit`'s return is: a cleanup function, or an
 * animation that the next split takes over. Call the returned function to
 * stop following; it undoes the last thing `onSplit` set up.
 */
export function followSplit(element: Element, onSplit: SplitCallback): () => void {
  if (!element.hasAttribute('data-split-state')) {
    warn('followSplit() has to be given the root element of a <SplitText>.');
  }
  let set = followers.get(element);
  if (!set) followers.set(element, (set = new Set()));
  const follower: Follower = { onSplit, effect: undefined, carried: null };
  set.add(follower);
  const read = current.get(element);
  if (read) run(follower, read());

  const own = set;
  return () => {
    if (!own.delete(follower)) return;
    undo(follower.effect);
    follower.effect = undefined;
  };
}
