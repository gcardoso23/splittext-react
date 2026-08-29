import { StrictMode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';
import { followSplit, SplitText, type SplitResult } from '../../src';
import {
  FakeAnimation,
  frames,
  mount,
  naturalLines,
  naturalWordLines,
  offscreen,
  rerender,
  splitLines,
  TEXT,
  unmountAll,
} from './helpers';

const MONO = { fontFamily: 'monospace', fontSize: 20, lineHeight: '28px' } as const;

function rootOf(host: HTMLElement): HTMLElement {
  return host.querySelector<HTMLElement>('[data-split-state]')!;
}

beforeEach(async () => {
  document.body.style.margin = '0';
  await page.viewport(1000, 700);
});

afterEach(() => {
  unmountAll();
});

describe('line breaks', () => {
  it.each([160, 240, 333, 520, 2000])('match the browser at %ipx', (width) => {
    const host = mount(<SplitText style={MONO}>{TEXT}</SplitText>, `width:${width}px`);
    const root = rootOf(host);
    expect(root.dataset.splitState).toBe('ready');
    expect(splitLines(root)).toEqual(naturalLines(root));
    expect(splitLines(root).join(' ')).toBe(TEXT);
  });

  it('are in place before the first paint', () => {
    // No frame has been awaited: mounting alone has to be enough.
    const host = mount(<SplitText style={MONO}>{TEXT}</SplitText>, 'width:300px');
    expect(splitLines(rootOf(host)).length).toBeGreaterThan(3);
  });

  it('do not change the height of the text', () => {
    const host = mount(<SplitText style={MONO}>{TEXT}</SplitText>, 'width:300px');
    const root = rootOf(host);
    expect(root.offsetHeight).toBe(splitLines(root).length * 28);
  });

  it('follow proportional fonts and centered text', () => {
    const host = mount(
      <SplitText as="h2" style={{ font: '600 32px/1.2 Georgia, serif', textAlign: 'center' }}>
        {TEXT}
      </SplitText>,
      'width:470px',
    );
    const root = rootOf(host);
    expect(splitLines(root)).toEqual(naturalLines(root));
  });

  it('honour forced breaks', () => {
    const host = mount(
      <SplitText style={MONO}>
        one two
        <br />
        three
      </SplitText>,
      'width:800px',
    );
    expect(splitLines(rootOf(host))).toEqual(['one two', 'three']);
  });

  it('break after hyphens like the browser does', () => {
    const text = 'a state-of-the-art-and-then-some solution';
    const host = mount(<SplitText style={MONO}>{text}</SplitText>, 'width:200px');
    const root = rootOf(host);
    expect(splitLines(root)).toEqual(naturalLines(root, text));
    expect(root.scrollWidth).toBeLessThanOrEqual(200);
  });

  it('keep hyphenated words whole when asked to', () => {
    const text = 'a state-of-the-art and e-commerce solution';
    const host = mount(
      <SplitText style={MONO} breakAfterHyphens={false}>
        {text}
      </SplitText>,
      'width:200px',
    );
    const root = rootOf(host);
    // Whole words: no line ends on a hyphen, and the breaks are those of a
    // row of word boxes.
    expect(splitLines(root).some((line) => line.endsWith('-'))).toBe(false);
    expect(splitLines(root)).toEqual(naturalWordLines(root, text));
  });

  it('are found when a word is in the middle of a transform', () => {
    const host = mount(
      <SplitText
        style={MONO}
        renderWord={({ props, children, index }) => (
          <span {...props} style={{ ...props.style, transform: `translateY(${index * 37}px)` }}>
            {children}
          </span>
        )}
      >
        {TEXT}
      </SplitText>,
      'width:300px',
    );
    const root = rootOf(host);
    expect(splitLines(root)).toEqual(naturalLines(root));
  });
});

describe('re-splitting', () => {
  it('follows the container', async () => {
    const host = mount(<SplitText style={MONO}>{TEXT}</SplitText>, 'width:500px');
    const root = rootOf(host);
    const before = splitLines(root);

    host.style.width = '260px';
    await frames();
    expect(splitLines(root)).toEqual(naturalLines(root));
    expect(splitLines(root)).not.toEqual(before);

    host.style.width = '700px';
    await frames();
    expect(splitLines(root)).toEqual(naturalLines(root));
  });

  it('follows the window', async () => {
    const host = mount(<SplitText style={MONO}>{TEXT}</SplitText>, 'width:50vw');
    const root = rootOf(host);
    expect(splitLines(root)).toEqual(naturalLines(root));

    await page.viewport(520, 700);
    await frames();
    expect(splitLines(root)).toEqual(naturalLines(root));

    await page.viewport(1400, 700);
    await frames();
    expect(splitLines(root)).toEqual(naturalLines(root));
  });

  it('follows a font size tied to the viewport inside a fixed width', async () => {
    const host = mount(
      <SplitText style={{ fontFamily: 'monospace', fontSize: '3vw' }}>{TEXT}</SplitText>,
      'width:400px',
    );
    const root = rootOf(host);
    const before = splitLines(root);

    await page.viewport(500, 700);
    await frames();
    expect(splitLines(root)).toEqual(naturalLines(root));
    expect(splitLines(root)).not.toEqual(before);

    await page.viewport(1300, 700);
    await frames();
    expect(splitLines(root)).toEqual(naturalLines(root));
  });

  it('follows a root that shrinks to fit its content', async () => {
    const host = mount(
      <SplitText style={MONO}>{TEXT}</SplitText>,
      'width:40vw;display:flex;flex-direction:column;align-items:center',
    );
    const root = rootOf(host);
    expect(splitLines(root)).toEqual(naturalLines(root));
    const before = splitLines(root).length;
    // Narrower than its container: it has wrapped itself around its lines.
    expect(root.offsetWidth).toBeLessThan(host.offsetWidth);
    await frames(4);

    // Growing is the hard direction: nothing about the root itself changes.
    await page.viewport(1900, 700);
    await frames(4);
    expect(splitLines(root)).toEqual(naturalLines(root));
    expect(splitLines(root).length).toBeLessThan(before);

    await page.viewport(700, 700);
    await frames(4);
    expect(splitLines(root)).toEqual(naturalLines(root));

    await page.viewport(1500, 700);
    await frames(4);
    expect(splitLines(root)).toEqual(naturalLines(root));
  });

  it('is done within the frame of a window resize', async () => {
    const host = mount(<SplitText style={MONO}>{TEXT}</SplitText>, 'width:50vw');
    const root = rootOf(host);
    const before = splitLines(root);
    await frames(4);

    // Registered after the library's own listener, so this callback runs
    // right behind it, in the frame the resize is delivered in.
    const inSameFrame = new Promise<string[]>((resolve) => {
      window.addEventListener(
        'resize',
        () => requestAnimationFrame(() => resolve(splitLines(root))),
        { once: true },
      );
    });
    await page.viewport(520, 700);
    const lines = await inSameFrame;
    expect(lines).not.toEqual(before);
    expect(lines).toEqual(naturalLines(root));
  });

  it('never trips the ResizeObserver loop limit', async () => {
    const errors: string[] = [];
    const onError = (event: ErrorEvent) => {
      errors.push(event.message);
      event.preventDefault();
    };
    window.addEventListener('error', onError);
    const host = mount(<SplitText style={MONO}>{TEXT}</SplitText>, 'width:500px');
    for (const width of [260, 700, 180, 420]) {
      host.style.width = `${width}px`;
      await frames();
      expect(splitLines(rootOf(host))).toEqual(naturalLines(rootOf(host)));
    }
    window.removeEventListener('error', onError);
    expect(errors).toEqual([]);
  });

  it('stays right at every width on the way', async () => {
    const host = mount(<SplitText style={MONO}>{TEXT}</SplitText>, 'width:520px');
    const root = rootOf(host);
    await frames(4);

    // Most steps are too small to move a word, so most of them are settled
    // by the shortcut that skips measuring. It must never skip wrongly.
    let toggles = 0;
    const observer = new MutationObserver((records) => (toggles += records.length));
    observer.observe(root, { attributes: true, attributeFilter: ['style'], subtree: true });
    // Measuring writes to every line twice: once to take it out of the flow,
    // once to put it back.
    let togglesIfAlwaysMeasured = 0;
    const widths = [];
    for (let width = 517; width >= 300; width -= 3) widths.push(width);
    for (let width = 304; width <= 520; width += 4) widths.push(width);
    for (const width of widths) {
      togglesIfAlwaysMeasured += 2 * splitLines(root).length;
      host.style.width = `${width}px`;
      await frames(2);
      expect(splitLines(root), `at ${width}px`).toEqual(naturalLines(root));
    }
    observer.disconnect();
    console.log(`sweep: ${toggles} line writes, ${togglesIfAlwaysMeasured} without the shortcut`);
    expect(toggles).toBeLessThan(togglesIfAlwaysMeasured);
  });

  it('skips measuring a single line that still fits', async () => {
    const host = mount(<SplitText style={MONO}>Short title</SplitText>, 'width:600px');
    const root = rootOf(host);
    await frames(4);
    let writes = 0;
    const observer = new MutationObserver((records) => (writes += records.length));
    observer.observe(root, { attributes: true, subtree: true });

    for (const width of [560, 480, 390, 300, 450]) {
      host.style.width = `${width}px`;
      await frames(2);
    }
    expect(writes).toBe(0);

    host.style.width = '90px';
    await frames();
    observer.disconnect();
    expect(splitLines(root)).toEqual(['Short', 'title']);
  });

  it('follows balanced wrapping', async (context) => {
    if (!CSS.supports('text-wrap', 'balance')) context.skip();
    const style = { ...MONO, textWrap: 'balance' } as const;
    const host = mount(<SplitText style={style}>{TEXT}</SplitText>, 'width:520px');
    const root = rootOf(host);
    expect(splitLines(root)).toEqual(naturalWordLines(root));
    // Balanced lines are not filled to the brim; plain wrapping would differ.
    root.style.textWrap = 'wrap';
    const plain = naturalLines(root);
    root.style.textWrap = 'balance';
    expect(splitLines(root)).not.toEqual(plain);

    // On the way back up there are widths at which no line has room for the
    // word after it, and yet balancing would spread the text over fewer
    // lines. Full lines must not be taken as proof that nothing changed.
    await frames(4);
    const widths = [];
    for (let width = 514; width >= 280; width -= 6) widths.push(width);
    for (let width = 285; width <= 520; width += 5) widths.push(width);
    for (const width of widths) {
      host.style.width = `${width}px`;
      await frames(2);
      expect(splitLines(root), `at ${width}px`).toEqual(naturalWordLines(root));
    }
  });

  it('keeps forced breaks while following the container', async () => {
    const host = mount(
      <SplitText style={MONO}>
        The quick brown fox
        <br />
        jumps over the lazy dog and keeps running through the quiet forest
      </SplitText>,
      'width:600px',
    );
    const root = rootOf(host);
    expect(splitLines(root)).toEqual([
      'The quick brown fox',
      'jumps over the lazy dog and keeps running through',
      'the quiet forest',
    ]);
    await frames(4);

    host.style.width = '900px';
    await frames();
    expect(splitLines(root)).toEqual([
      'The quick brown fox',
      'jumps over the lazy dog and keeps running through the quiet forest',
    ]);

    host.style.width = '200px';
    await frames();
    expect(splitLines(root).slice(0, 3)).toEqual(['The quick brown', 'fox', 'jumps over the']);
  });

  it('waits for hidden text to be shown', async () => {
    const host = mount(<SplitText style={MONO}>{TEXT}</SplitText>, 'width:300px;display:none');
    const root = rootOf(host);
    expect(root.dataset.splitState).toBe('pending');

    host.style.display = 'block';
    await frames();
    expect(root.dataset.splitState).toBe('ready');
    expect(splitLines(root)).toEqual(naturalLines(root));
  });

  it('follows the text', () => {
    const host = mount(<SplitText style={MONO}>{TEXT}</SplitText>, 'width:300px');
    const shorter = 'Now something else entirely, still long enough to wrap twice';
    rerender(host, <SplitText style={MONO}>{shorter}</SplitText>);
    const root = rootOf(host);
    expect(root.dataset.splitState).toBe('ready');
    expect(splitLines(root)).toEqual(naturalLines(root, shorter));
  });

  it('brings offscreen text up to date once resizing has settled', async () => {
    const host = mount(
      <>
        <div style={{ height: 5000 }} />
        <SplitText style={MONO}>{TEXT}</SplitText>
      </>,
      'width:50vw',
    );
    const root = rootOf(host);
    await offscreen(root);
    const before = splitLines(root);

    await page.viewport(520, 700);
    await frames(2);
    expect(splitLines(root)).toEqual(before);

    await expect
      .poll(() => splitLines(root).join('|'), { timeout: 2000, interval: 50 })
      .toBe(naturalLines(root).join('|'));
    expect(splitLines(root)).not.toEqual(before);
  });

  it('can be switched off', async () => {
    const host = mount(
      <SplitText style={MONO} autoSplit={false}>
        {TEXT}
      </SplitText>,
      'width:500px',
    );
    const root = rootOf(host);
    const before = splitLines(root);
    host.style.width = '260px';
    await frames();
    expect(splitLines(root)).toEqual(before);
  });
});

describe('fonts', () => {
  it('re-splits when a font arrives late', async (context) => {
    const face = new FontFace(
      'SplitTextLate',
      'local("Courier New"), local("Liberation Mono"), local("DejaVu Sans Mono")',
    );
    const host = mount(
      <SplitText style={{ fontFamily: 'SplitTextLate, "Times New Roman", serif', fontSize: 20 }}>
        {TEXT}
      </SplitText>,
      'width:330px',
    );
    const root = rootOf(host);
    const before = splitLines(root);
    expect(before).toEqual(naturalLines(root));

    document.fonts.add(face);
    try {
      await face.load();
    } catch {
      document.fonts.delete(face);
      context.skip();
    }
    await document.fonts.ready;
    await frames();

    expect(splitLines(root)).toEqual(naturalLines(root));
    // A monospaced font is far wider than a serif: the breaks must have moved.
    expect(splitLines(root)).not.toEqual(before);
    document.fonts.delete(face);
  });

  it('holds onSplit back until fonts are loaded when asked to', async (context) => {
    const face = new FontFace(
      'SplitTextHeld',
      'local("Courier New"), local("Liberation Mono"), local("DejaVu Sans Mono")',
    );
    document.fonts.add(face);
    const loading = face.load();
    if (document.fonts.status !== 'loading') {
      document.fonts.delete(face);
      context.skip();
    }

    const onSplit = vi.fn();
    const host = mount(
      <SplitText style={{ fontFamily: 'SplitTextHeld, serif' }} waitForFonts onSplit={onSplit}>
        {TEXT}
      </SplitText>,
      'width:330px',
    );
    const root = rootOf(host);
    expect(root.dataset.splitState).toBe('pending');
    expect(onSplit).not.toHaveBeenCalled();

    await loading.catch(() => {});
    await document.fonts.ready;
    await frames();
    expect(root.dataset.splitState).toBe('ready');
    expect(onSplit).toHaveBeenCalledTimes(1);
    expect(splitLines(root)).toEqual(naturalLines(root));
    document.fonts.delete(face);
  });
});

describe('onSplit', () => {
  it('receives the elements and is only called again when lines change', async () => {
    const calls: SplitResult[] = [];
    const cleanup = vi.fn();
    const host = mount(
      <SplitText
        style={MONO}
        split={['lines', 'words', 'chars']}
        onSplit={(result) => {
          calls.push(result);
          return cleanup;
        }}
      >
        {TEXT}
      </SplitText>,
      'width:500px',
    );
    const root = rootOf(host);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.root).toBe(root);
    expect(calls[0]!.lines).toHaveLength(splitLines(root).length);
    expect(calls[0]!.words).toHaveLength(TEXT.split(' ').length);
    expect(calls[0]!.chars).toHaveLength(TEXT.replace(/ /g, '').length);

    // Monospaced at 20px, a character is about 12px wide: two pixels of
    // extra room can not move a word.
    const lines = splitLines(root);
    host.style.width = '502px';
    await frames();
    if (splitLines(root).join('|') === lines.join('|')) {
      expect(calls).toHaveLength(1);
      expect(cleanup).not.toHaveBeenCalled();
    }

    host.style.width = '250px';
    await frames();
    expect(calls).toHaveLength(2);
    expect(cleanup).toHaveBeenCalledTimes(1);
    expect(calls[1]!.lines.every((line) => line.isConnected)).toBe(true);

    unmountAll();
    expect(cleanup).toHaveBeenCalledTimes(2);
  });

  it('is not called again when the parent re-renders the same content', () => {
    const onSplit = vi.fn();
    const render = () => (
      <SplitText style={MONO} onSplit={onSplit}>
        Hello <em>{TEXT}</em>
      </SplitText>
    );
    const host = mount(render(), 'width:300px');
    const word = host.querySelector('[data-split="word"]');
    rerender(host, render());
    rerender(host, render());
    expect(onSplit).toHaveBeenCalledTimes(1);
    expect(host.querySelector('[data-split="word"]')).toBe(word);
  });

  it('carries a returned animation over to the next split', async () => {
    const animations: FakeAnimation[] = [];
    const host = mount(
      <SplitText
        style={MONO}
        onSplit={({ lines }) => {
          // Longer with every line, as a stagger is.
          const animation = new FakeAnimation(lines.length);
          animations.push(animation);
          return animation;
        }}
      >
        {TEXT}
      </SplitText>,
      'width:500px',
    );
    expect(animations).toHaveLength(1);

    animations[0]!.totalTime(0.5);
    host.style.width = '250px';
    await frames();
    expect(animations).toHaveLength(2);
    expect(animations[0]!.reverted).toBe(true);
    expect(animations[1]!.totalTime()).toBe(0.5);

    // Finished, the next one is finished too, though it has more lines to go.
    animations[1]!.progress(1);
    host.style.width = '180px';
    await frames();
    expect(animations).toHaveLength(3);
    expect(animations[2]!.duration).toBeGreaterThan(animations[1]!.duration);
    expect(animations[2]!.progress()).toBe(1);

    unmountAll();
    expect(animations[2]!.reverted).toBe(true);
  });

  it('works in strict mode', async () => {
    const host = mount(
      <StrictMode>
        <SplitText style={MONO}>{TEXT}</SplitText>
      </StrictMode>,
      'width:300px',
    );
    const root = rootOf(host);
    expect(splitLines(root)).toEqual(naturalLines(root));
    host.style.width = '500px';
    await frames();
    expect(splitLines(root)).toEqual(naturalLines(root));
  });
});

describe('followSplit', () => {
  it('follows a split from outside React', async () => {
    const host = mount(<SplitText style={MONO}>{TEXT}</SplitText>, 'width:500px');
    const root = rootOf(host);
    const calls: SplitResult[] = [];
    const animations: FakeAnimation[] = [];
    const stop = followSplit(root, (result) => {
      calls.push(result);
      const animation = new FakeAnimation();
      animations.push(animation);
      return animation;
    });
    // At once, with the lines on screen.
    expect(calls).toHaveLength(1);
    expect(calls[0]!.root).toBe(root);
    expect(calls[0]!.lines).toHaveLength(splitLines(root).length);

    animations[0]!.totalTime(0.25);
    host.style.width = '250px';
    await frames();
    expect(calls).toHaveLength(2);
    expect(calls[1]!.lines).toHaveLength(splitLines(root).length);
    expect(calls[1]!.lines.every((line) => line.isConnected)).toBe(true);
    expect(animations[0]!.reverted).toBe(true);
    expect(animations[1]!.totalTime()).toBe(0.25);

    stop();
    expect(animations[1]!.reverted).toBe(true);
    host.style.width = '400px';
    await frames();
    expect(calls).toHaveLength(2);
  });

  it('waits for the text to be split', async () => {
    const host = mount(<SplitText style={MONO}>{TEXT}</SplitText>, 'width:300px;display:none');
    const root = rootOf(host);
    const onSplit = vi.fn();
    followSplit(root, onSplit);
    expect(onSplit).not.toHaveBeenCalled();

    host.style.display = 'block';
    await frames();
    expect(onSplit).toHaveBeenCalledTimes(1);
    expect(onSplit.mock.calls[0]![0].lines).toHaveLength(splitLines(root).length);
  });

  it('runs alongside onSplit, and cleans up when the text goes away', () => {
    const own = vi.fn();
    const cleanup = vi.fn();
    const host = mount(
      <SplitText style={MONO} onSplit={own}>
        {TEXT}
      </SplitText>,
      'width:300px',
    );
    followSplit(rootOf(host), () => cleanup);
    expect(own).toHaveBeenCalledTimes(1);
    unmountAll();
    expect(cleanup).toHaveBeenCalledTimes(1);
  });
});

describe('nested elements', () => {
  it('are rendered once per line they span', async () => {
    const onClick = vi.fn((event: { preventDefault(): void }) => event.preventDefault());
    const host = mount(
      <SplitText style={MONO} aria="none">
        Start{' '}
        <a href="#x" onClick={onClick} style={{ position: 'relative' }}>
          {TEXT}
        </a>{' '}
        end
      </SplitText>,
      'width:300px',
    );
    const root = rootOf(host);
    const full = `Start ${TEXT} end`;
    expect(splitLines(root)).toEqual(naturalLines(root, full));

    const lines = Array.from(root.querySelectorAll('[data-split="line"]'));
    const links = Array.from(root.querySelectorAll('a'));
    expect(links).toHaveLength(lines.length);
    expect(lines.every((line) => line.querySelectorAll('a').length === 1)).toBe(true);

    links[links.length - 1]!.click();
    expect(onClick).toHaveBeenCalledTimes(1);

    host.style.width = '520px';
    await frames();
    expect(splitLines(root)).toEqual(naturalLines(root, full));
  });

  it('do not confuse the measurement when they change the font size', () => {
    const host = mount(
      <SplitText style={MONO}>
        The quick brown <small style={{ fontSize: 11 }}>fox jumps over the lazy</small> dog and{' '}
        <strong style={{ fontSize: 34 }}>keeps running through</strong> the quiet forest
      </SplitText>,
      'width:320px',
    );
    const root = rootOf(host);
    const lines = splitLines(root);
    expect(lines.join(' ')).toBe(
      'The quick brown fox jumps over the lazy dog and keeps running through the quiet forest',
    );
    // Every line element holds exactly one visual row.
    for (const line of root.querySelectorAll<HTMLElement>('[data-split="line"]')) {
      const tops = Array.from(line.querySelectorAll<HTMLElement>('[data-split="word"]'), (word) =>
        word.getBoundingClientRect(),
      );
      const bottom = Math.min(...tops.map((rect) => rect.bottom));
      expect(tops.every((rect) => rect.top < bottom)).toBe(true);
    }
  });
});

describe('many instances', () => {
  it('stay correct together', async () => {
    const host = mount(
      <>
        {Array.from({ length: 60 }, (_, i) => (
          <SplitText key={i} as="p" style={{ ...MONO, margin: 0 }} split={['lines', 'chars']}>
            {`${i} ${TEXT}`}
          </SplitText>
        ))}
      </>,
      'width:60vw',
    );
    const roots = Array.from(host.querySelectorAll<HTMLElement>('[data-split-state]'));
    expect(roots).toHaveLength(60);
    for (const root of roots) expect(splitLines(root)).toEqual(naturalLines(root));

    await page.viewport(640, 700);
    // The ones offscreen catch up a few per frame once resizing pauses, as
    // many as the machine has time for.
    const settled = () =>
      roots.every((root) => splitLines(root).join('|') === naturalLines(root).join('|'));
    await expect.poll(settled, { timeout: 3000, interval: 50 }).toBe(true);
    for (const root of roots) expect(splitLines(root)).toEqual(naturalLines(root));
  });
});

describe('other options', () => {
  it('wraps lines in a mask', async () => {
    const host = mount(
      <SplitText style={MONO} mask>
        {TEXT}
      </SplitText>,
      'width:300px',
    );
    const root = rootOf(host);
    const masks = Array.from(root.children) as HTMLElement[];
    expect(masks.every((mask) => mask.dataset.split === 'mask')).toBe(true);
    expect(getComputedStyle(masks[0]!).overflow).toBe('clip');
    expect(splitLines(root)).toEqual(naturalLines(root));

    host.style.width = '520px';
    await frames();
    expect(splitLines(root)).toEqual(naturalLines(root));
  });

  it('numbers lines through a custom property', () => {
    const host = mount(
      <SplitText style={MONO} cssVars>
        {TEXT}
      </SplitText>,
      'width:300px',
    );
    const root = rootOf(host);
    const lines = Array.from(root.querySelectorAll<HTMLElement>('[data-split="line"]'));
    expect(root.style.getPropertyValue('--line-total')).toBe(String(lines.length));
    expect(lines[2]!.style.getPropertyValue('--line-index')).toBe('2');
    // Words inherit the index of the line they are on.
    const word = lines[2]!.querySelector('[data-split="word"]')!;
    expect(getComputedStyle(word).getPropertyValue('--line-index')).toBe('2');
  });

  it('does no measuring without lines', async () => {
    const host = mount(
      <SplitText style={MONO} split={['words', 'chars']}>
        {TEXT}
      </SplitText>,
      'width:300px',
    );
    const root = rootOf(host);
    expect(root.dataset.splitState).toBe('ready');
    expect(root.querySelector('[data-split="line"]')).toBeNull();
    expect(root.textContent).toBe(TEXT);
  });

  it('forwards its ref and other props to the root', () => {
    let node: HTMLElement | null = null;
    const host = mount(
      <SplitText
        as="h1"
        id="title"
        className="heading"
        ref={(element) => {
          node = element;
        }}
      >
        Hello
      </SplitText>,
    );
    const root = rootOf(host);
    expect(node).toBe(root);
    expect(root.tagName).toBe('H1');
    expect(root.id).toBe('title');
    expect(root.className).toBe('heading');
    expect(root.getAttribute('aria-label')).toBe('Hello');
  });
});
