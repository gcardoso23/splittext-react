import type { ReactNode } from 'react';
import { flushSync } from 'react-dom';
import { createRoot, type Root } from 'react-dom/client';

export const TEXT =
  'The quick brown fox jumps over the lazy dog and keeps running through the quiet forest until night falls over the hills';

const mounted: { root: Root; host: HTMLElement }[] = [];

/** Renders synchronously, layout effects included. */
export function mount(node: ReactNode, hostStyle = ''): HTMLElement {
  const host = document.createElement('div');
  host.style.cssText = hostStyle;
  document.body.appendChild(host);
  const root = createRoot(host);
  flushSync(() => root.render(node));
  mounted.push({ root, host });
  return host;
}

export function rerender(host: HTMLElement, node: ReactNode): void {
  const entry = mounted.find((candidate) => candidate.host === host)!;
  flushSync(() => entry.root.render(node));
}

export function unmountAll(): void {
  for (const { root, host } of mounted.splice(0)) {
    root.unmount();
    host.remove();
  }
}

export async function frames(count = 3): Promise<void> {
  for (let i = 0; i < count; i++) {
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  }
}

export function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function clean(text: string | null): string {
  return (text ?? '').replace(/\s+/g, ' ').trim();
}

/** The lines as <SplitText> rendered them. */
export function splitLines(root: Element): string[] {
  return Array.from(root.querySelectorAll('[data-split="line"]'), (line) =>
    clean(line.textContent),
  );
}

/**
 * The lines as the browser breaks the same text when nothing is split: the
 * text is put, plain, in a twin of the element and every character is
 * located with a Range. Going character by character keeps this independent
 * of any idea of what a word is.
 */
export function naturalLines(root: HTMLElement, text: string = clean(root.textContent)): string[] {
  const twin = root.cloneNode(false) as HTMLElement;
  twin.removeAttribute('aria-label');
  twin.textContent = text;
  root.after(twin);

  const node = twin.firstChild as Text;
  const range = document.createRange();
  const starts: number[] = [];
  let lastTop = -Infinity;
  for (let i = 0; i < text.length; i++) {
    if (/\s/.test(text[i]!)) continue;
    range.setStart(node, i);
    range.setEnd(node, i + 1);
    const top = Math.round(range.getClientRects()[0]!.top);
    if (top > lastTop + 2) {
      starts.push(i);
      lastTop = top;
    }
  }
  twin.remove();
  return starts.map((start, index) => clean(text.slice(start, starts[index + 1])));
}

/**
 * The lines the browser makes of the same words when each is an inline-block
 * and nothing wraps them. With `text-wrap: balance` this is the reference:
 * the browser balances such boxes a little differently from plain text.
 */
export function naturalWordLines(root: HTMLElement, text: string = clean(root.textContent)): string[] {
  const twin = root.cloneNode(false) as HTMLElement;
  twin.removeAttribute('aria-label');
  for (const word of text.split(' ')) {
    const span = document.createElement('span');
    span.style.display = 'inline-block';
    span.textContent = word;
    twin.append(span, ' ');
  }
  root.after(twin);

  const lines: string[][] = [];
  let bottom = -Infinity;
  for (const span of Array.from(twin.children) as HTMLElement[]) {
    if (span.offsetTop >= bottom - 2) lines.push([]);
    bottom = span.offsetTop + span.offsetHeight;
    lines[lines.length - 1]!.push(span.textContent!);
  }
  twin.remove();
  return lines.map((words) => words.join(' '));
}

/** Shaped like a GSAP tween, as far as `onSplit` cares. */
export class FakeAnimation {
  time = 0;
  reverted = false;

  constructor(readonly duration = 1) {}

  totalTime(): number;
  totalTime(value: number): this;
  totalTime(value?: number): number | this {
    if (value === undefined) return this.time;
    this.time = value;
    return this;
  }

  progress(): number;
  progress(value: number): this;
  progress(value?: number): number | this {
    if (value === undefined) return this.time / this.duration;
    this.time = value * this.duration;
    return this;
  }

  revert(): this {
    this.reverted = true;
    return this;
  }
}

/**
 * Resolves once an IntersectionObserver with the library's margin has seen
 * the element out of view. Observers report in the order they were made, so
 * the library's own has seen it by then too.
 */
export function offscreen(element: Element): Promise<void> {
  return new Promise((resolve) => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) return;
        observer.disconnect();
        resolve();
      },
      { rootMargin: '50% 0px' },
    );
    observer.observe(element);
  });
}
