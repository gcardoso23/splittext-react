import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cdp, page, server } from 'vitest/browser';
import { SplitText } from '../../src';
import { frames, mount, naturalLines, splitLines, TEXT, unmountAll } from './helpers';

const COUNT = 200;
const STYLE = { fontFamily: 'monospace', fontSize: 16, margin: 0 } as const;

async function layoutCount(): Promise<number> {
  const { metrics } = (await cdp().send('Performance.getMetrics')) as {
    metrics: { name: string; value: number }[];
  };
  return metrics.find((metric) => metric.name === 'LayoutCount')!.value;
}

function many(split: ('lines' | 'words' | 'chars')[]) {
  return (
    <>
      {Array.from({ length: COUNT }, (_, i) => (
        <SplitText key={i} as="p" style={STYLE} split={split}>
          {`${i} ${TEXT}`}
        </SplitText>
      ))}
    </>
  );
}

beforeEach(async () => {
  document.body.style.margin = '0';
  await page.viewport(1000, 700);
  if (server.browser === 'chromium') await cdp().send('Performance.enable');
});

afterEach(() => {
  unmountAll();
});

// Layouts are counted through the DevTools protocol, which only Chromium speaks.
describe.skipIf(server.browser !== 'chromium')(`${COUNT} instances`, () => {
  it('the layout counter sees forced layouts (sanity check)', async () => {
    const box = document.createElement('div');
    document.body.appendChild(box);
    const before = await layoutCount();
    for (let i = 0; i < 50; i++) {
      box.style.width = `${100 + i}px`;
      void box.offsetWidth;
    }
    const after = await layoutCount();
    box.remove();
    expect(after - before).toBeGreaterThanOrEqual(50);
  });

  it('mount with a handful of layouts, not one per instance', async () => {
    await frames(2);
    const before = await layoutCount();
    const start = performance.now();
    const host = mount(many(['lines', 'words']), 'width:60vw');
    const elapsed = performance.now() - start;
    const after = await layoutCount();
    const roots = host.querySelectorAll('[data-split-state="ready"]');
    expect(roots).toHaveLength(COUNT);
    console.log(`mount: ${after - before} layouts, ${elapsed.toFixed(1)}ms`);
    expect(after - before).toBeLessThanOrEqual(4);
  });

  it('re-split on resize with a handful of layouts per frame', async () => {
    // Tall viewport so that every instance counts as visible.
    await page.viewport(1000, 20000);
    const host = mount(many(['lines', 'words']), 'width:60vw');
    await frames(4);
    const roots = Array.from(host.querySelectorAll<HTMLElement>('[data-split-state]'));
    const linesBefore = splitLines(roots[0]!);

    const before = await layoutCount();
    const done = new Promise<number>((resolve) => {
      window.addEventListener(
        'resize',
        () => {
          const start = performance.now();
          // Runs after the library's frame callback: time what is left of it.
          requestAnimationFrame(() => resolve(performance.now() - start));
        },
        { once: true },
      );
    });
    await page.viewport(700, 20000);
    const elapsed = await done;
    const after = await layoutCount();
    await frames(4);
    const settled = await layoutCount();

    console.log(
      `resize: ${after - before} layouts in the resize frame (${elapsed.toFixed(1)}ms), ${settled - after} in the 4 frames after`,
    );
    expect(splitLines(roots[0]!)).not.toEqual(linesBefore);
    for (const root of roots) expect(root.dataset.splitState).toBe('ready');
    expect(splitLines(roots[COUNT - 1]!)).toEqual(naturalLines(roots[COUNT - 1]!));
    expect(after - before).toBeLessThanOrEqual(6);
  });

  it('do nothing on a resize that leaves their width alone', async () => {
    await page.viewport(1000, 20000);
    const host = mount(many(['lines', 'words']), 'width:500px');
    await frames(4);
    const root = host.querySelector<HTMLElement>('[data-split-state]')!;
    let queries = 0;
    const original = root.querySelectorAll.bind(root);
    root.querySelectorAll = ((selector: string) => {
      queries++;
      return original(selector);
    }) as typeof root.querySelectorAll;
    const display = root.querySelector<HTMLElement>('[data-split="line"]')!.style;
    let writes = 0;
    const observer = new MutationObserver((records) => (writes += records.length));
    observer.observe(root, { attributes: true, subtree: true });

    await page.viewport(800, 20000);
    await frames(4);
    observer.disconnect();
    expect(display.display).toBe('block');
    expect(queries).toBe(0);
    expect(writes).toBe(0);
  });
});
