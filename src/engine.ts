import { flushSync } from 'react-dom';
import { computeLineStarts, sameStarts, TOLERANCE } from './lines';
import type { Model } from './tokenize';
import { warn } from './warn';

/*
 * One engine serves every <SplitText> on the page.
 *
 * Line breaks are never computed, only observed: the words are laid out by
 * the browser as ordinary inline content and we read where each one landed.
 * Reading layout is cheap once; it gets expensive when reads and writes
 * alternate, because every read after a write makes the browser lay the page
 * out again. So the work of all instances is pooled and done in phases, once
 * per frame:
 *
 *   check    read each root's size and drop the instances where nothing
 *            changed, or where the current lines provably still hold
 *   prepare  write: take the line wrappers out of the flow
 *   measure  read: where every word sits
 *   restore  write: put the line wrappers back
 *   commit   one synchronous React update for the instances whose lines moved
 *
 * The number of layouts in a frame does not grow with the number of
 * instances.
 */

const MEASURED = '[data-split="word"],[data-split="atom"]';
const WRAPPERS = '[data-split="line"],[data-split="mask"]';
const LINE = '[data-split="line"]';

// Sizes come in fractions of a pixel. Anything closer than this is the same.
const EPSILON = 0.05;

const EMPTY: readonly never[] = [];

let tops = new Float64Array(256);
let heights = new Float64Array(256);

/**
 * A positioned nested element (`<a style="position: relative">`) becomes the
 * offset parent of the words inside it, and their offsets stop being
 * comparable with those of the other words.
 */
function hasOwnOffsetParent(element: HTMLElement, root: HTMLElement): boolean {
  const parent = element.offsetParent;
  return parent !== null && parent !== root && root.contains(parent);
}

export class Controller {
  root: HTMLElement | null = null;
  onChange: (signature: string, starts: number[]) => void = () => {};

  private signature = '';
  private measured: readonly number[] = EMPTY;
  private deep: readonly boolean[] = EMPTY;
  private nested = false;
  /** The line starts currently rendered, or null while the text is unmeasured. */
  private starts: readonly number[] | null = null;
  private next: number[] | null = null;

  // Looked up once per render, not once per frame.
  private elements: HTMLElement[] | null = null;
  private wrappers: HTMLElement[] | null = null;
  private line: HTMLElement | null = null;
  private saved: string[] | null = null;

  private attempted = false;
  private stale = false;
  // The root's size while its words flowed freely, at the last measurement,
  private naturalWidth = -1;
  private naturalHeight = -1;
  // and its size with the line wrappers in place, once that has been seen.
  private settledWidth = -1;
  private settledHeight = -1;
  // Whether the root shrinks to fit its lines. Such a root can't tell us when
  // more room becomes available, because it never grows on its own.
  private contentSized = false;
  // Whether the root is known not to, for the lines it has now.
  private trusted = false;
  // Whether the browser fills each line before starting the next. Balanced
  // or "pretty" wrapping doesn't.
  private greedy = true;

  /** Called after every render of the component. */
  sync(root: HTMLElement | null, model: Model, starts: readonly number[] | null): void {
    if (root !== this.root || model.signature !== this.signature) this.attempted = false;
    this.root = root;
    this.signature = model.signature;
    this.measured = model.measured;
    this.deep = model.deep;
    this.nested = model.nested;
    if (starts !== this.starts) {
      this.starts = starts;
      this.settledWidth = -1;
      this.trusted = false;
    }
    this.elements = null;
    this.wrappers = null;
    this.line = null;
  }

  /** Forces a measurement at the next opportunity, whatever the size says. */
  invalidate(): void {
    this.stale = true;
  }

  /**
   * Measures right away, for text that has just been rendered and is still
   * flowing freely. Tried once per text: if the root isn't laid out yet, the
   * ResizeObserver takes over.
   */
  measureNow(): number[] | null {
    if (this.attempted) return null;
    this.attempted = true;
    this.measure();
    const next = this.next;
    this.next = null;
    return next;
  }

  /** Reads the root's size and tells whether the lines have to be measured. */
  check(): boolean {
    const root = this.root;
    if (!root || !root.isConnected) return false;
    const { width, height } = root.getBoundingClientRect();
    const seen = this.settledWidth >= 0;
    // Height matters as much as width: a font size that follows the viewport
    // re-flows the text inside a container whose width never moves.
    const changed =
      Math.abs(width - (seen ? this.settledWidth : this.naturalWidth)) > EPSILON ||
      Math.abs(height - (seen ? this.settledHeight : this.naturalHeight)) > EPSILON;
    this.settledWidth = width;
    this.settledHeight = height;
    // With its lines in place the root is the size it was without them: it
    // doesn't shrink to fit.
    if (!seen && !changed) this.trusted = true;

    if (this.stale || this.contentSized) return true;
    if (!changed) return false;
    return !(this.trusted && this.tight());
  }

  /**
   * Tells, from the lines as they are and without writing anything, whether
   * measuring would find the same breaks: no line has wrapped inside itself,
   * and no line has room left for the word that follows it.
   *
   * It errs on the side of measuring. Rounding, a forced break or anything
   * unusual makes it answer no.
   */
  private tight(): boolean {
    const starts = this.starts;
    const measured = this.measured;
    if (!starts || !this.greedy || this.nested) return false;
    const root = this.root!;
    const elements = (this.elements ??= Array.from(
      root.querySelectorAll<HTMLElement>(MEASURED),
    ));
    const line = (this.line ??= root.querySelector<HTMLElement>(LINE));
    if (!line || elements.length !== measured.length) return false;

    const available = line.offsetWidth;
    let used = 0;
    let position = 0;
    for (let index = 0; index < starts.length; index++) {
      const end = index + 1 < starts.length ? starts[index + 1]! : Infinity;
      const from = position;
      while (position < measured.length && measured[position]! < end) position++;
      if (position === from) return false;

      const first = elements[from]!;
      const last = elements[position - 1]!;
      const firstLeft = first.offsetLeft;
      const firstWidth = first.offsetWidth;
      // Would this line's first word have fitted at the end of the previous one?
      if (index > 0 && used + firstWidth <= available + TOLERANCE) return false;
      if (last === first) {
        used = firstWidth;
        continue;
      }
      // Has the line wrapped inside itself?
      if (last.offsetTop >= first.offsetTop + first.offsetHeight - TOLERANCE) return false;
      const lastLeft = last.offsetLeft;
      used =
        Math.max(firstLeft + firstWidth, lastLeft + last.offsetWidth) -
        Math.min(firstLeft, lastLeft);
    }
    return true;
  }

  /** Write phase: lets the words flow as if the line wrappers weren't there. */
  prepare(): void {
    const root = this.root;
    if (!root || !this.starts || !root.isConnected) return;
    const wrappers = (this.wrappers ??= Array.from(
      root.querySelectorAll<HTMLElement>(WRAPPERS),
    ));
    if (wrappers.length < this.starts.length) {
      warn(
        'Could not find the line elements. A custom `renderLine` has to spread `props` on the element it returns.',
      );
    }
    const saved = new Array<string>(wrappers.length);
    for (let i = 0; i < wrappers.length; i++) {
      const style = wrappers[i]!.style;
      saved[i] = style.display;
      style.display = 'contents';
    }
    this.saved = saved;
  }

  /** Read phase: works out the line starts from where the words landed. */
  measure(): void {
    this.next = null;
    const root = this.root;
    if (!root || !root.isConnected) return;
    const rect = root.getBoundingClientRect();
    // Not laid out, inside `display: none` for instance. The ResizeObserver
    // reports back when that changes.
    if (rect.width === 0 && rect.height === 0) return;

    const elements = (this.elements ??= Array.from(
      root.querySelectorAll<HTMLElement>(MEASURED),
    ));
    const count = elements.length;
    if (count !== this.measured.length) {
      warn(
        'Could not find the word elements. A custom `renderWord` has to spread `props` on the element it returns, and <SplitText> can not be nested.',
      );
      return;
    }
    if (count > tops.length) {
      tops = new Float64Array(count * 2);
      heights = new Float64Array(count * 2);
    }
    const deep = this.deep;
    let comparable = true;
    for (let i = 0; i < count; i++) {
      const element = elements[i]!;
      if (deep[i] && hasOwnOffsetParent(element, root)) {
        comparable = false;
        break;
      }
      // Offsets, unlike client rects, ignore transforms: a word that is
      // halfway through an animation still reports where it belongs.
      heights[i] = element.offsetHeight;
      tops[i] = element.offsetTop;
    }
    if (!comparable) {
      // Browsers disagree on offsets inside a positioned inline element that
      // spans several lines. Client rects are the same everywhere.
      for (let i = 0; i < count; i++) {
        const box = elements[i]!.getBoundingClientRect();
        heights[i] = box.height;
        tops[i] = box.top;
      }
    }
    const starts = computeLineStarts(tops, heights, this.measured, count);

    const style = getComputedStyle(root);
    const wrap = style.getPropertyValue('text-wrap-style') || style.getPropertyValue('text-wrap');
    this.greedy = !/balance|pretty/.test(wrap);

    this.stale = false;
    this.naturalWidth = rect.width;
    this.naturalHeight = rect.height;
    if (!sameStarts(starts, this.starts)) {
      this.next = starts;
    } else if (this.settledWidth >= 0) {
      this.contentSized = starts.length > 1 && this.settledWidth < rect.width - EPSILON;
      this.trusted = !this.contentSized;
    }
  }

  /** Write phase: undoes `prepare`. Tells whether the lines have changed. */
  restore(): boolean {
    const saved = this.saved;
    if (saved) {
      const wrappers = this.wrappers!;
      for (let i = 0; i < saved.length; i++) wrappers[i]!.style.display = saved[i]!;
      this.saved = null;
    }
    return this.next !== null;
  }

  commit(): void {
    const next = this.next;
    this.next = null;
    if (next) this.onChange(this.signature, next);
  }

  /** Read phase, after a commit: the size the root has with its new lines. */
  settle(): void {
    const root = this.root;
    const starts = this.starts;
    if (!root || !starts || !root.isConnected) return;
    const { width, height } = root.getBoundingClientRect();
    this.settledWidth = width;
    this.settledHeight = height;
    this.contentSized = starts.length > 1 && width < this.naturalWidth - EPSILON;
    this.trusted = !this.contentSized;
  }
}

const controllers = new Set<Controller>();
const byRoot = new WeakMap<Element, Controller>();
// Instances whose size is worth checking this frame.
const queued = new Set<Controller>();

let frame = 0;
let resized = false;
let resizeObserver: ResizeObserver | null = null;

function schedule(): void {
  if (frame === 0) frame = requestAnimationFrame(flush);
}

function flush(): void {
  frame = 0;
  if (resized) {
    resized = false;
    for (const controller of controllers) queued.add(controller);
  }

  const batch: Controller[] = [];
  for (const controller of queued) if (controller.check()) batch.push(controller);
  queued.clear();
  if (batch.length === 0) return;

  const changed: Controller[] = [];
  try {
    for (const controller of batch) controller.prepare();
    for (const controller of batch) controller.measure();
  } finally {
    for (const controller of batch) if (controller.restore()) changed.push(controller);
  }
  // Committed here rather than left to React's scheduler, so the new lines
  // are painted in this very frame.
  if (changed.length > 0) {
    flushSync(() => {
      for (const controller of changed) controller.commit();
    });
    // The browser has to lay the new lines out before painting anyway; taking
    // note of the result now saves measuring again when the ResizeObserver
    // reports it.
    for (const controller of changed) controller.settle();
  }
}

function onResizeEntries(entries: ResizeObserverEntry[]): void {
  // Nothing is measured in here. Changing layout from inside the observer's
  // callback is what raises "ResizeObserver loop" errors.
  for (const entry of entries) {
    const controller = byRoot.get(entry.target);
    if (controller) queued.add(controller);
  }
  if (queued.size > 0) schedule();
}

// A resize event is dispatched before the frame's animation callbacks, the
// ResizeObserver only after layout. Starting from the event is what lets the
// lines follow the window without lagging a frame behind.
function onWindowResize(): void {
  resized = true;
  schedule();
}

function onFontsLoaded(): void {
  for (const controller of controllers) {
    controller.invalidate();
    queued.add(controller);
  }
  schedule();
}

function start(): void {
  if (typeof ResizeObserver !== 'undefined') {
    resizeObserver = new ResizeObserver(onResizeEntries);
  }
  window.addEventListener('resize', onWindowResize, { passive: true });
  const fonts = document.fonts;
  if (fonts && fonts.addEventListener) fonts.addEventListener('loadingdone', onFontsLoaded);
}

function stop(): void {
  resizeObserver?.disconnect();
  resizeObserver = null;
  window.removeEventListener('resize', onWindowResize);
  const fonts = document.fonts;
  if (fonts && fonts.removeEventListener) {
    fonts.removeEventListener('loadingdone', onFontsLoaded);
  }
  if (frame !== 0) cancelAnimationFrame(frame);
  frame = 0;
  resized = false;
}

/** Keeps an instance's lines up to date until the returned function is called. */
export function register(controller: Controller): () => void {
  const root = controller.root;
  if (!root || typeof window === 'undefined') return () => {};
  if (controllers.size === 0) start();
  controllers.add(controller);
  byRoot.set(root, controller);
  resizeObserver?.observe(root);

  return () => {
    controllers.delete(controller);
    byRoot.delete(root);
    queued.delete(controller);
    resizeObserver?.unobserve(root);
    if (controllers.size === 0) stop();
  };
}
