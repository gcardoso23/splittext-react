import { Fragment, isValidElement, type ReactElement, type ReactNode } from 'react';

/** A nested element (`<em>`, `<a>`...) that words can live inside. */
export interface Wrapper {
  readonly id: number;
  readonly element: ReactElement<{ children?: ReactNode }>;
}

export type Path = readonly Wrapper[];

export interface WordPart {
  readonly text: string;
  readonly chars: readonly string[] | null;
  /** Index of the part's first character in the whole text. */
  readonly charIndex: number;
  readonly path: Path;
}

/**
 * An unbreakable run of text. Usually one part; several when the run crosses
 * element boundaries (`<b>wor</b>ld`), in which case `path` is what the parts
 * have in common.
 */
export interface WordItem {
  readonly kind: 'word';
  readonly index: number;
  readonly parts: WordPart[];
  path: Path;
  text: string;
}

export interface SpaceItem {
  readonly kind: 'space';
  readonly text: string;
  readonly path: Path;
}

/** An element we can't look inside (`<img>`, an icon...). Measured like a word. */
export interface AtomItem {
  readonly kind: 'atom';
  readonly node: ReactElement;
  readonly path: Path;
}

/** Rendered untouched and never measured: `<br>`, `<wbr>`, portals. */
export interface RawItem {
  readonly kind: 'raw';
  readonly node: ReactNode;
  readonly path: Path;
}

export type Item = WordItem | SpaceItem | AtomItem | RawItem;

export interface Model {
  readonly items: readonly Item[];
  /** Item index of every measured element (words and atoms), in document order. */
  readonly measured: readonly number[];
  /** For each measured element, whether it sits inside a nested element. */
  readonly deep: readonly boolean[];
  /** Whether any measured element does. */
  readonly nested: boolean;
  readonly wordCount: number;
  readonly charCount: number;
  /** The plain text, for `aria-label`. */
  readonly label: string;
  /**
   * Identifies the text and its structure. Measured line breaks stay valid
   * for as long as this doesn't change, however often the parent re-renders.
   */
  readonly signature: string;
}

// Whitespace that CSS collapses, plus the zero-width space. A non-breaking
// space is deliberately absent: it has to keep its two words together.
const WHITESPACE = /([ \t\n\r\f\u200B]+)/;

const HYPHENS = '\\-\\u2010\\u2013\\u2014';
const HAS_HYPHEN = new RegExp(`[${HYPHENS}]`);
// The browser may break a line after a hyphen or dash inside a word, unless a
// digit follows ("3-4") or nothing precedes it ("-foo").
const HYPHEN_BREAK = new RegExp(`([^${HYPHENS}]+[${HYPHENS}]+)(?=[^\\d${HYPHENS}])`);

const ASCII = /^[\x20-\x7E]*$/;

let segmenter: Intl.Segmenter | null | undefined;

function graphemes(text: string): string[] {
  if (ASCII.test(text)) return text.split('');
  if (segmenter === undefined) {
    segmenter =
      typeof Intl !== 'undefined' && 'Segmenter' in Intl
        ? new Intl.Segmenter(undefined, { granularity: 'grapheme' })
        : null;
  }
  if (segmenter === null) return Array.from(text);
  const out: string[] = [];
  for (const { segment } of segmenter.segment(text)) out.push(segment);
  return out;
}

function commonPrefix(a: Path, b: Path): Path {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  return i === a.length ? a : i === b.length ? b : a.slice(0, i);
}

function typeName(type: unknown): string {
  if (typeof type === 'string') return type;
  if (typeof type === 'function' || (typeof type === 'object' && type !== null)) {
    const named = type as { displayName?: string; name?: string };
    return named.displayName || named.name || 'component';
  }
  return 'unknown';
}

function isSplittable(children: unknown): boolean {
  return children != null && typeof children !== 'function' && typeof children !== 'boolean';
}

const LAZY = Symbol.for('react.lazy');

/**
 * A node that stands for another one until it is resolved. Elements a server
 * component hands to a client component can arrive this way: the server sees
 * the element, the client the reference to it.
 */
interface LazyNode {
  readonly $$typeof: symbol;
  readonly _payload: unknown;
  readonly _init: (payload: unknown) => ReactNode;
}

function isLazy(node: unknown): node is LazyNode {
  return (
    typeof node === 'object' &&
    node !== null &&
    (node as { $$typeof?: unknown }).$$typeof === LAZY &&
    typeof (node as { _init?: unknown })._init === 'function'
  );
}

export function tokenize(children: ReactNode, splitChars: boolean): Model {
  const items: Item[] = [];
  const measured: number[] = [];
  const signature: string[] = [];
  const label: string[] = [];
  let wordCount = 0;
  let charCount = 0;
  let wrapperCount = 0;
  // The word still being assembled; whitespace or an atom closes it.
  let open: WordItem | null = null;

  function addWordPart(text: string, path: Path): void {
    const chars = splitChars ? graphemes(text) : null;
    const part: WordPart = { text, chars, charIndex: charCount, path };
    if (chars) charCount += chars.length;
    signature.push(text);
    label.push(text);
    if (open) {
      open.parts.push(part);
      open.path = commonPrefix(open.path, path);
      open.text += text;
      return;
    }
    open = { kind: 'word', index: wordCount++, parts: [part], path, text };
    measured.push(items.length);
    items.push(open);
  }

  function addText(text: string, path: Path): void {
    const chunks = text.split(WHITESPACE);
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      if (!chunk) continue;
      if (i % 2 === 1) {
        open = null;
        items.push({ kind: 'space', text: chunk, path });
        signature.push(chunk);
        label.push(' ');
        continue;
      }
      if (!HAS_HYPHEN.test(chunk)) {
        addWordPart(chunk, path);
        continue;
      }
      // Splitting on a capturing pattern puts the pieces that end in a
      // breakable hyphen at the odd positions.
      const pieces = chunk.split(HYPHEN_BREAK);
      for (let p = 0; p < pieces.length; p++) {
        const piece = pieces[p];
        if (!piece) continue;
        addWordPart(piece, path);
        if (p % 2 === 1) open = null;
      }
    }
  }

  function addOpaque(node: ReactNode, path: Path, name: string, measure: boolean): void {
    open = null;
    signature.push(`[${name}]`);
    label.push(' ');
    if (measure) {
      measured.push(items.length);
      items.push({ kind: 'atom', node: node as ReactElement, path });
    } else {
      items.push({ kind: 'raw', node, path });
    }
  }

  function walk(node: ReactNode, path: Path): void {
    if (node == null || typeof node === 'boolean') return;
    if (typeof node === 'string' || typeof node === 'number' || typeof node === 'bigint') {
      addText(String(node), path);
      return;
    }
    if (Array.isArray(node)) {
      for (const child of node) walk(child as ReactNode, path);
      return;
    }
    if (isLazy(node)) {
      // Resolved by now, or this throws and the render suspends until it
      // is, as rendering the node would.
      walk(node._init(node._payload), path);
      return;
    }
    if (isValidElement<{ children?: ReactNode; 'data-split-ignore'?: unknown }>(node)) {
      const { type, props } = node;
      if (type === Fragment) {
        walk(props.children, path);
        return;
      }
      const name = typeName(type);
      if (type === 'br' || type === 'wbr') {
        addOpaque(node, path, name, false);
        return;
      }
      if (!isSplittable(props.children) || props['data-split-ignore'] != null) {
        addOpaque(node, path, name, true);
        return;
      }
      signature.push(`<${name}>`);
      walk(props.children, [...path, { id: wrapperCount++, element: node }]);
      signature.push('</>');
      return;
    }
    if (typeof (node as Iterable<ReactNode>)[Symbol.iterator] === 'function') {
      for (const child of node as Iterable<ReactNode>) walk(child, path);
      return;
    }
    addOpaque(node, path, 'node', false);
  }

  walk(children, []);

  const deep = measured.map((index) => items[index]!.path.length > 0);

  return {
    items,
    measured,
    deep,
    nested: deep.includes(true),
    wordCount,
    charCount,
    label: label.join('').replace(/\s+/g, ' ').trim(),
    signature: signature.join('\u0001'),
  };
}
