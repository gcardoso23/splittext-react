import { describe, expect, it } from 'vitest';
import { tokenize, type Item, type Model, type WordItem } from '../../src/tokenize';

function words(items: readonly Item[]): string[] {
  return items.flatMap((item) => (item.kind === 'word' ? [item.text] : []));
}

function kinds(items: readonly Item[]): string[] {
  return items.map((item) => item.kind);
}

function wordAt(model: Model, index: number): WordItem {
  const item = model.items[index];
  if (item?.kind !== 'word') throw new Error(`Item ${index} is not a word`);
  return item;
}

describe('tokenize', () => {
  it('separates words and whitespace', () => {
    const model = tokenize('Hello  big\nworld', false);
    expect(kinds(model.items)).toEqual(['word', 'space', 'word', 'space', 'word']);
    expect(words(model.items)).toEqual(['Hello', 'big', 'world']);
    expect(model.measured).toEqual([0, 2, 4]);
    expect(model.wordCount).toBe(3);
    expect(model.label).toBe('Hello big world');
  });

  it('keeps the original whitespace, so `white-space: pre-line` still works', () => {
    const model = tokenize('one\ntwo', false);
    expect(model.items[1]).toMatchObject({ kind: 'space', text: '\n' });
  });

  it('does not break at a non-breaking space', () => {
    expect(words(tokenize('10\u00A0km away', false).items)).toEqual(['10\u00A0km', 'away']);
  });

  it('breaks at a zero-width space', () => {
    expect(words(tokenize('super\u200Bcali', false).items)).toEqual(['super', 'cali']);
  });

  it('allows a break after a hyphen or dash inside a word', () => {
    const model = tokenize('state-of-the-art word\u2014word', false);
    expect(words(model.items)).toEqual(['state-', 'of-', 'the-', 'art', 'word\u2014', 'word']);
    // No whitespace was invented between the pieces.
    expect(kinds(model.items)).toEqual(['word', 'word', 'word', 'word', 'space', 'word', 'word']);
  });

  it('leaves hyphens alone where the browser would not break', () => {
    expect(words(tokenize('-foo 3-4 a- --', false).items)).toEqual(['-foo', '3-4', 'a-', '--']);
  });

  it('splits characters by grapheme', () => {
    const model = tokenize('a\u{1F469}\u200D\u{1F680}e\u0301 ok', true);
    expect(wordAt(model, 0).parts[0]!.chars).toEqual([
      'a',
      '\u{1F469}\u200D\u{1F680}',
      'e\u0301',
    ]);
    expect(wordAt(model, 2).parts[0]!.charIndex).toBe(3);
    expect(model.charCount).toBe(5);
  });

  it('does not split characters unless asked', () => {
    const model = tokenize('abc', false);
    expect(wordAt(model, 0).parts[0]!.chars).toBeNull();
    expect(model.charCount).toBe(0);
  });

  it('records the elements a word is nested in', () => {
    const model = tokenize(
      <>
        Hello <em>big world</em> again
      </>,
      false,
    );
    expect(words(model.items)).toEqual(['Hello', 'big', 'world', 'again']);
    const depths = model.items.map((item) => item.path.length);
    //        Hello ' ' big ' ' world ' ' again
    expect(depths).toEqual([0, 0, 1, 1, 1, 0, 0]);
    expect(model.items[2]!.path[0]).toBe(model.items[4]!.path[0]);
    expect(model.deep).toEqual([false, true, true, false]);
    expect(model.nested).toBe(true);
  });

  it('keeps a word in one piece when only part of it is wrapped', () => {
    const model = tokenize(
      <>
        <b>wor</b>ld
      </>,
      false,
    );
    expect(model.items).toHaveLength(1);
    const word = wordAt(model, 0);
    expect(word.text).toBe('world');
    expect(word.path).toHaveLength(0);
    expect(word.parts.map((part) => part.path.length)).toEqual([1, 0]);
  });

  it('passes line breaks through and measures other opaque elements', () => {
    const model = tokenize(
      <>
        one
        <br />
        two <img alt="" /> three
      </>,
      false,
    );
    expect(kinds(model.items)).toEqual(['word', 'raw', 'word', 'space', 'atom', 'space', 'word']);
    expect(model.measured).toEqual([0, 2, 4, 6]);
    expect(model.label).toBe('one two three');
  });

  it('does not look inside elements marked with data-split-ignore', () => {
    const model = tokenize(
      <>
        a <code data-split-ignore="">x y</code>
      </>,
      false,
    );
    expect(kinds(model.items)).toEqual(['word', 'space', 'atom']);
  });

  it('flattens fragments, arrays and numbers', () => {
    const model = tokenize(['Total: ', 42, <>{[' items', null, false]}</>], false);
    expect(words(model.items)).toEqual(['Total:', '42', 'items']);
  });

  it('gives equal content an equal signature', () => {
    const render = (text: string) =>
      tokenize(
        <>
          Hello <em className="x">{text}</em>
        </>,
        false,
      ).signature;
    expect(render('world')).toBe(render('world'));
    expect(render('world')).not.toBe(render('there'));
    expect(tokenize('a b', false).signature).not.toBe(tokenize('ab', false).signature);
    expect(tokenize(<em>a</em>, false).signature).not.toBe(tokenize(<b>a</b>, false).signature);
  });
});
