import {
  cloneElement,
  createElement,
  forwardRef,
  Fragment,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type Attributes,
  type CSSProperties,
  type ElementType,
  type ForwardedRef,
  type ReactElement,
  type ReactNode,
} from 'react';
import { Controller, register } from './engine';
import { resume, undo, type Carried } from './animation';
import { publish } from './follow';
import { fontsLoaded, subscribeToFonts } from './fonts';
import { tokenize, type Item, type Model, type Path, type WordItem, type WordPart } from './tokenize';
import type {
  SplitElementProps,
  SplitResult,
  SplitTextComponent,
  SplitTextOwnProps,
  SplitTypes,
  SplitUnit,
} from './types';
import { warn } from './warn';

type InnerProps = SplitTextOwnProps & {
  as?: ElementType;
  style?: CSSProperties;
  'aria-label'?: string;
  'aria-hidden'?: boolean | 'true' | 'false';
  [prop: string]: unknown;
};

interface Measurement {
  signature: string;
  starts: number[];
}

interface LeafOptions {
  wordClassName: string | undefined;
  charClassName: string | undefined;
  cssVars: boolean;
  hidden: true | undefined;
  renderWord: SplitTextOwnProps['renderWord'];
  renderChar: SplitTextOwnProps['renderChar'];
}

interface LineOptions {
  lineClassName: string | undefined;
  maskClassName: string | undefined;
  cssVars: boolean;
  mask: boolean;
  hidden: true | undefined;
  renderLine: SplitTextOwnProps['renderLine'];
}

const useIsomorphicLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

const DEFAULT_SPLIT: readonly SplitUnit[] = ['lines', 'words'];
// Until the text has been measured it is rendered as a single line that takes
// no part in layout, so the words flow exactly as they would unsplit.
const UNMEASURED: readonly number[] = [0];

const INLINE_BLOCK: CSSProperties = { display: 'inline-block' };
const BLOCK: CSSProperties = { display: 'block' };
const CONTENTS: CSSProperties = { display: 'contents' };
const MASK: CSSProperties = { display: 'block', overflow: 'clip' };
const HIDDEN = { 'aria-hidden': true } as const;

const subscribeToNothing = (): (() => void) => () => {};
const yes = (): boolean => true;
const no = (): boolean => false;

function includes(split: SplitTypes, unit: SplitUnit): boolean {
  return (split as string | readonly string[]).includes(unit);
}

function withVar(display: string, name: string, value: number): CSSProperties {
  return { display, [name]: value } as CSSProperties;
}

/**
 * Rebuilds the nested elements around a run of leaves. An element that spans
 * several lines is rendered once per line, around the part that falls there.
 */
function nest<T extends { readonly path: Path }>(
  leaves: readonly T[],
  start: number,
  end: number,
  depth: number,
  render: (leaf: T, index: number) => ReactNode,
  wrapperProps?: typeof HIDDEN,
): ReactNode[] {
  const out: ReactNode[] = [];
  let i = start;
  while (i < end) {
    const leaf = leaves[i]!;
    const wrapper = leaf.path[depth];
    if (!wrapper) {
      out.push(render(leaf, i));
      i++;
      continue;
    }
    let j = i + 1;
    while (j < end && leaves[j]!.path[depth] === wrapper) j++;
    out.push(
      cloneElement(
        wrapper.element,
        { key: `w${wrapper.id}`, ...wrapperProps } as Attributes,
        nest(leaves, i, j, depth + 1, render),
      ),
    );
    i = j;
  }
  return out;
}

function renderChar(
  char: string,
  index: number,
  key: number,
  word: WordItem,
  options: LeafOptions,
): ReactElement {
  const style = options.cssVars ? withVar('inline-block', '--char-index', index) : INLINE_BLOCK;
  if (!options.renderChar) {
    return createElement(
      'span',
      { key, 'data-split': 'char', className: options.charClassName, style },
      char,
    );
  }
  const props: SplitElementProps = {
    'data-split': 'char',
    className: options.charClassName,
    style,
    'aria-hidden': undefined,
  };
  return cloneElement(
    options.renderChar({ props, children: char, char, index, wordIndex: word.index }),
    { key },
  );
}

function renderPart(part: WordPart, word: WordItem, options: LeafOptions): ReactNode {
  const chars = part.chars;
  if (!chars) return part.text;
  return chars.map((char, i) => renderChar(char, part.charIndex + i, i, word, options));
}

function renderWord(word: WordItem, key: number, options: LeafOptions): ReactElement {
  const depth = word.path.length;
  const parts = word.parts;
  const children =
    parts.length === 1 && parts[0]!.path.length === depth
      ? renderPart(parts[0]!, word, options)
      : nest(parts, 0, parts.length, depth, (part, i) =>
          createElement(Fragment, { key: i }, renderPart(part, word, options)),
        );
  const props: SplitElementProps = {
    'data-split': 'word',
    className: options.wordClassName,
    style: options.cssVars ? withVar('inline-block', '--word-index', word.index) : INLINE_BLOCK,
    'aria-hidden': options.hidden,
  };
  if (!options.renderWord) return createElement('span', { key, ...props }, children);
  return cloneElement(
    options.renderWord({ props, children, index: word.index, text: word.text }),
    { key },
  );
}

function renderItem(item: Item, key: number, options: LeafOptions): ReactNode {
  switch (item.kind) {
    case 'space':
      return item.text;
    case 'raw':
      return createElement(Fragment, { key }, item.node);
    case 'atom':
      return createElement(
        'span',
        { key, 'data-split': 'atom', style: INLINE_BLOCK, 'aria-hidden': options.hidden },
        item.node,
      );
    case 'word':
      return renderWord(item, key, options);
  }
}

function renderLines(
  model: Model,
  leaves: readonly ReactNode[],
  starts: readonly number[] | null,
  options: LineOptions,
): ReactNode[] {
  const items = model.items;
  const measured = starts !== null;
  const lines = starts ?? UNMEASURED;
  const leafAt = (_: Item, index: number): ReactNode => leaves[index];

  return lines.map((start, index) => {
    const last = index + 1 === lines.length;
    const end = last ? items.length : lines[index + 1]!;
    const children = nest(items, start, end, 0, leafAt);
    // The space between two lines sits at the end of the first. Firefox
    // builds no box for whitespace that is the last thing in a block, and
    // does not go back on that when the lines are taken out of the flow to be
    // measured: the two words would touch. An empty element after the space
    // is enough to prevent it. (Wrapping the space instead would work too,
    // but changes how Chrome balances `text-wrap: balance`.)
    if (!last && typeof children[children.length - 1] === 'string') {
      children.push(createElement('span', { key: 'eol', 'data-split': 'eol' }));
    }
    const props: SplitElementProps = {
      'data-split': 'line',
      className: options.lineClassName,
      style: !measured
        ? CONTENTS
        : options.cssVars
          ? withVar('block', '--line-index', index)
          : BLOCK,
      'aria-hidden': options.mask ? undefined : options.hidden,
    };
    const line = options.renderLine
      ? options.renderLine({ props, children, index, total: lines.length })
      : createElement('span', props, children);
    if (!options.mask) return cloneElement(line, { key: index });
    return createElement(
      'span',
      {
        key: index,
        'data-split': 'mask',
        className: options.maskClassName,
        style: measured ? MASK : CONTENTS,
        'aria-hidden': options.hidden,
      },
      line,
    );
  });
}

function query(root: HTMLElement, unit: string): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(`[data-split="${unit}"]`));
}

function SplitTextInner(props: InnerProps, forwardedRef: ForwardedRef<HTMLElement>): ReactElement {
  const {
    as: Tag = 'div',
    children,
    split = DEFAULT_SPLIT,
    mask = false,
    cssVars = false,
    aria = 'auto',
    autoSplit = true,
    waitForFonts = false,
    lineClassName,
    wordClassName,
    charClassName,
    maskClassName,
    renderLine,
    renderWord: customWord,
    renderChar: customChar,
    onSplit,
    style,
    ...rest
  } = props;

  const wantLines = includes(split, 'lines');
  const wantChars = includes(split, 'chars');
  const hidden = aria === 'auto' ? true : undefined;

  const model = useMemo(() => tokenize(children, wantChars), [children, wantChars]);

  const [measurement, setMeasurement] = useState<Measurement | null>(null);
  // Line starts are only as good as the text they were measured for.
  const starts =
    wantLines && measurement !== null && measurement.signature === model.signature
      ? measurement.starts
      : null;

  const fontsReady = useSyncExternalStore(
    waitForFonts ? subscribeToFonts : subscribeToNothing,
    waitForFonts ? fontsLoaded : yes,
    waitForFonts ? no : yes,
  );
  const ready = (!wantLines || starts !== null) && fontsReady;

  // Without lines there is no element that wraps the words, so each of them
  // is hidden on its own.
  const leafHidden = wantLines ? undefined : hidden;
  const leaves = useMemo(() => {
    const options: LeafOptions = {
      wordClassName,
      charClassName,
      cssVars,
      hidden: leafHidden,
      renderWord: customWord,
      renderChar: customChar,
    };
    return model.items.map((item, index) => renderItem(item, index, options));
  }, [model, wordClassName, charClassName, cssVars, leafHidden, customWord, customChar]);

  const content = useMemo(() => {
    if (!wantLines) {
      const leafAt = (_: Item, index: number): ReactNode => leaves[index];
      return nest(model.items, 0, model.items.length, 0, leafAt, hidden && HIDDEN);
    }
    return renderLines(model, leaves, starts, {
      lineClassName,
      maskClassName,
      cssVars,
      mask,
      hidden,
      renderLine,
    });
  }, [model, leaves, starts, wantLines, lineClassName, maskClassName, cssVars, mask, hidden, renderLine]);

  const rootRef = useRef<HTMLElement | null>(null);
  const setRoot = useCallback(
    (node: HTMLElement | null) => {
      rootRef.current = node;
      if (typeof forwardedRef === 'function') forwardedRef(node);
      else if (forwardedRef) forwardedRef.current = node;
    },
    [forwardedRef],
  );

  const controllerRef = useRef<Controller | null>(null);
  const controller = (controllerRef.current ??= new Controller());

  useIsomorphicLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) warn('The `as` component has to forward its ref to a DOM element.');
    controller.onChange = (signature, next) => setMeasurement({ signature, starts: next });
    controller.sync(root, model, starts);
    if (!wantLines || starts !== null) return;
    // All instances mounting together measure here, one after the other, with
    // nothing written in between: a single layout serves the lot. The state
    // update re-renders before the browser paints.
    const next = controller.measureNow();
    if (next) setMeasurement({ signature: model.signature, starts: next });
  });

  useIsomorphicLayoutEffect(() => {
    if (!wantLines || !autoSplit) return;
    return register(controller);
  }, [controller, wantLines, autoSplit, Tag]);

  const onSplitRef = useRef(onSplit);
  useIsomorphicLayoutEffect(() => {
    onSplitRef.current = onSplit;
  });

  // Where the last animation `onSplit` returned had got to, for the next one.
  const carriedRef = useRef<Carried | null>(null);

  useIsomorphicLayoutEffect(() => {
    const root = rootRef.current;
    if (!ready || !root) return;
    let result: SplitResult | undefined;
    // Looked up only if someone asks for them.
    const read = (): SplitResult =>
      (result ??= {
        root,
        lines: wantLines ? query(root, 'line') : [],
        words: query(root, 'word'),
        chars: wantChars ? query(root, 'char') : [],
      });
    const callback = onSplitRef.current;
    const effect = callback ? callback(read()) : undefined;
    resume(effect, carriedRef.current);
    carriedRef.current = null;
    const retract = publish(root, read);
    return () => {
      retract();
      carriedRef.current = undo(effect);
    };
  }, [ready, model.signature, starts, wantLines, wantChars, mask]);

  const lineCount = starts ? starts.length : 1;
  const rootStyle = cssVars
    ? ({
        ...(wantLines && { '--line-total': lineCount }),
        '--word-total': model.wordCount,
        ...(wantChars && { '--char-total': model.charCount }),
        ...style,
      } as CSSProperties)
    : style;

  return createElement(
    Tag,
    {
      ...rest,
      ref: setRoot,
      style: rootStyle,
      'data-split-state': ready ? 'ready' : 'pending',
      'aria-label': rest['aria-label'] ?? (hidden && model.label ? model.label : undefined),
      'aria-hidden': aria === 'hidden' ? true : rest['aria-hidden'],
    },
    content,
  );
}

/**
 * Splits its text into lines, words and characters.
 *
 * Lines follow the browser's own line breaking and are kept up to date when
 * the available width changes or fonts finish loading.
 */
export const SplitText: SplitTextComponent = forwardRef(SplitTextInner) as SplitTextComponent;

SplitText.displayName = 'SplitText';
