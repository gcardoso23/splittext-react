import type {
  ComponentPropsWithoutRef,
  CSSProperties,
  ElementType,
  ReactElement,
  ReactNode,
  RefAttributes,
} from 'react';

/**
 * What the text is split into.
 *
 * Words are always wrapped, whatever you ask for: they are the unit line
 * breaks are measured with, and they keep characters from breaking mid-word.
 */
export type SplitUnit = 'lines' | 'words' | 'chars';

export type SplitTypes = SplitUnit | readonly SplitUnit[];

/** The elements of a finished split, in document order. */
export interface SplitResult {
  root: HTMLElement;
  /** Empty unless `split` includes `'lines'`. */
  lines: HTMLElement[];
  words: HTMLElement[];
  /** Empty unless `split` includes `'chars'`. */
  chars: HTMLElement[];
}

/**
 * An animation `onSplit` can hand back: a GSAP tween or timeline, or anything
 * with the same methods. A split that replaces the elements reverts it, and
 * the animation returned for the new elements starts where it had got to.
 */
export interface SplitAnimation {
  totalTime(): number;
  totalTime(value: number): unknown;
  progress(): number;
  progress(value: number): unknown;
  revert(): unknown;
}

/**
 * What `onSplit` returns: nothing, a function that undoes what it set up, or
 * an animation to carry over to the next split.
 */
export type SplitEffect = void | (() => void) | SplitAnimation;

export type SplitCallback = (result: SplitResult) => SplitEffect;

/**
 * Props a custom `renderLine` / `renderWord` / `renderChar` element has to
 * receive. Spread them on the outermost DOM element you return: the
 * `data-split` attribute and the `display` style are how lines get measured.
 */
export interface SplitElementProps {
  'data-split': 'line' | 'word' | 'char';
  className: string | undefined;
  style: CSSProperties;
  'aria-hidden': true | undefined;
}

export interface LineRenderInfo {
  props: SplitElementProps;
  children: ReactNode;
  /** Index of the line. */
  index: number;
  /** Number of lines. */
  total: number;
}

export interface WordRenderInfo {
  props: SplitElementProps;
  children: ReactNode;
  /** Index of the word in the whole text. */
  index: number;
  text: string;
}

export interface CharRenderInfo {
  props: SplitElementProps;
  children: string;
  /** Index of the character in the whole text. */
  index: number;
  /** Index of the word the character belongs to. */
  wordIndex: number;
  char: string;
}

export interface SplitTextOwnProps {
  /** Text to split. Nested elements (`<em>`, `<a>`, `<br />`...) are kept. */
  children?: ReactNode;
  /**
   * What to split into.
   * @default ['lines', 'words']
   */
  split?: SplitTypes;
  /**
   * Wrap every line in a clipping element (`overflow: clip`), for reveal
   * effects where the line slides in from outside its own box.
   * @default false
   */
  mask?: boolean;
  /**
   * Expose indexes as CSS custom properties: `--line-index`, `--word-index`
   * and `--char-index` on the elements, `--line-total`, `--word-total` and
   * `--char-total` on the root. Handy for staggering in plain CSS.
   * @default false
   */
  cssVars?: boolean;
  /**
   * - `'auto'`: the root gets an `aria-label` with the full text and the
   *   split elements are hidden from assistive technology.
   * - `'hidden'`: the whole element is hidden from assistive technology.
   * - `'none'`: no ARIA attributes are added.
   * @default 'auto'
   */
  aria?: 'auto' | 'hidden' | 'none';
  /**
   * Re-split when the available width changes or fonts finish loading.
   * @default true
   */
  autoSplit?: boolean;
  /**
   * Hold back `onSplit` and `data-split-state="ready"` until the document's
   * fonts have loaded, so entrance animations start from the final layout.
   * @default false
   */
  waitForFonts?: boolean;
  lineClassName?: string;
  wordClassName?: string;
  charClassName?: string;
  maskClassName?: string;
  /** Render a line yourself. Spread `props` on the element you return. */
  renderLine?: (info: LineRenderInfo) => ReactElement;
  /** Render a word yourself. Spread `props` on the element you return. */
  renderWord?: (info: WordRenderInfo) => ReactElement;
  /** Render a character yourself. Spread `props` on the element you return. */
  renderChar?: (info: CharRenderInfo) => ReactElement;
  /**
   * Called before paint every time the text has been split: on mount, and
   * again whenever the lines actually change. Return a function to clean up
   * before the next split or unmount, or return the animation itself: it is
   * reverted then, and the one returned for the new elements starts where
   * it had got to.
   */
  onSplit?: SplitCallback;
}

export type SplitTextProps<T extends ElementType = 'div'> = SplitTextOwnProps & {
  /**
   * Element or component to render as the root. A component has to forward
   * its ref to a DOM element.
   * @default 'div'
   */
  as?: T;
} & Omit<ComponentPropsWithoutRef<T>, keyof SplitTextOwnProps | 'as'>;

export interface SplitTextComponent {
  <T extends ElementType = 'div'>(
    props: SplitTextProps<T> & RefAttributes<HTMLElement>,
  ): ReactElement | null;
  displayName?: string;
}
