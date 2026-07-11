import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { SplitText } from '../../src';

describe('server rendering', () => {
  it('renders the words inside one line that takes no part in layout', () => {
    const html = renderToString(<SplitText as="h1">Hello world</SplitText>);
    expect(html).toBe(
      '<h1 data-split-state="pending" aria-label="Hello world">' +
        '<span data-split="line" style="display:contents" aria-hidden="true">' +
        '<span data-split="word" style="display:inline-block">Hello</span>' +
        ' ' +
        '<span data-split="word" style="display:inline-block">world</span>' +
        '</span>' +
        '</h1>',
    );
  });

  it('is ready straight away when there are no lines to measure', () => {
    const html = renderToString(
      <SplitText split={['words', 'chars']} charClassName="c">
        Hi
      </SplitText>,
    );
    expect(html).toBe(
      '<div data-split-state="ready" aria-label="Hi">' +
        '<span data-split="word" style="display:inline-block" aria-hidden="true">' +
        '<span data-split="char" class="c" style="display:inline-block">H</span>' +
        '<span data-split="char" class="c" style="display:inline-block">i</span>' +
        '</span>' +
        '</div>',
    );
  });

  it('exposes indexes as custom properties', () => {
    const html = renderToString(
      <SplitText split={['words', 'chars']} cssVars aria="none">
        ab c
      </SplitText>,
    );
    expect(html).toContain('<div style="--word-total:2;--char-total:3" data-split-state="ready">');
    expect(html).toContain('style="display:inline-block;--word-index:1"');
    expect(html).toContain('style="display:inline-block;--char-index:2"');
  });

  it('keeps nested elements and their props', () => {
    const html = renderToString(
      <SplitText split="words" aria="none">
        Go <a href="/home">back home</a>
      </SplitText>,
    );
    expect(html).toContain(
      '<a href="/home">' +
        '<span data-split="word" style="display:inline-block">back</span>' +
        ' ' +
        '<span data-split="word" style="display:inline-block">home</span>' +
        '</a>',
    );
  });

  it('wraps a partially styled word as a whole', () => {
    const html = renderToString(
      <SplitText split="words" aria="none">
        <b>wor</b>ld
      </SplitText>,
    );
    expect(html).toContain(
      '<span data-split="word" style="display:inline-block"><b>wor</b>ld</span>',
    );
  });

  it('respects the aria prop', () => {
    expect(renderToString(<SplitText aria="hidden">Hi</SplitText>)).toContain(
      '<div data-split-state="pending" aria-hidden="true">',
    );
    const none = renderToString(<SplitText aria="none">Hi</SplitText>);
    expect(none).not.toContain('aria-');
    expect(renderToString(<SplitText aria-label="Custom">Hi</SplitText>)).toContain(
      'aria-label="Custom"',
    );
  });

  it('lets render props replace the elements', () => {
    const html = renderToString(
      <SplitText
        split="words"
        aria="none"
        renderWord={({ props, children, index }) => (
          <strong {...props} data-index={index}>
            {children}
          </strong>
        )}
      >
        a b
      </SplitText>,
    );
    expect(html).toContain(
      '<strong data-split="word" style="display:inline-block" data-index="1">b</strong>',
    );
  });
});
