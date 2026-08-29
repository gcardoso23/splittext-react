# splittext-react

Split text into lines, words and characters in React, for animation.

```tsx
import { SplitText } from 'splittext-react';

<SplitText as="h1">Text that knows where its lines break</SplitText>;
```

- **Lines are the browser's own.** Nothing is computed: the words are laid out as normal text and the library reads where each one landed.
- **Lines stay right.** They are re-split when the container or window changes size, when a font finishes loading, when a font size tied to the viewport changes, and when the text itself changes.
- **Made for pages with a lot of text.** Every instance shares one scheduler. Mounting 200 of them costs two layouts, not 200; a resize costs a handful per frame, whatever the count.
- **Server-rendered.** Words and characters are in the HTML. No hydration mismatch, no layout shift when lines are added.
- **React all the way down.** Lines, words and characters are React elements. Style them with classes, or render them yourself as `motion.span` or anything else.
- **TypeScript.** No dependencies besides React.

Tested in Chromium, Firefox and WebKit.

## Install

```sh
npm install splittext-react
```

Requires `react` and `react-dom` 18 or later.

## Usage

`SplitText` renders an element (a `div` unless you pass `as`) and takes any prop that element takes.

```tsx
<SplitText as="p" className="lede" split={['lines', 'words', 'chars']}>
  Nested elements are fine: <em>emphasis</em>, <a href="/docs">links</a>,
  <br />
  and forced breaks.
</SplitText>
```

The result is plain markup you can target from CSS:

```html
<p class="lede" data-split-state="ready" aria-label="...">
  <span data-split="line" style="display:block" aria-hidden="true">
    <span data-split="word" style="display:inline-block">
      <span data-split="char" style="display:inline-block">N</span>
      ...
    </span>
    ...
  </span>
  ...
</p>
```

A line that is followed by another ends with an empty `<span data-split="eol">`. Leave it where it is: without it, Firefox loses the space between two lines while they are being measured.

### Animating with CSS

`cssVars` puts indexes on the elements as custom properties, so a stagger needs no JavaScript. Custom properties inherit: a word or character can read the `--line-index` of the line it is on.

```tsx
<SplitText as="h1" className="title" mask cssVars>
  Text that knows where its lines break
</SplitText>
```

```css
.title [data-split='line'] {
  transform: translateY(110%);
  transition: transform 0.9s cubic-bezier(0.2, 0.8, 0.2, 1);
  transition-delay: calc(var(--line-index) * 90ms);
}

.title.is-visible [data-split='line'] {
  transform: none;
}
```

`mask` wraps each line in an element with `overflow: clip`, which is what makes the line appear from behind its own edge.

`data-split-state` on the root is `pending` until the lines are known, then `ready`. Use it to keep text hidden until it can be animated:

```css
[data-split-state='pending'] {
  visibility: hidden;
}
```

### Animating with GSAP, or anything that wants elements

`onSplit` receives the elements. It runs before the browser paints, on mount and again each time the lines really change. Return a function to undo what you set up.

```tsx
<SplitText
  as="h1"
  mask
  onSplit={({ lines }) => {
    const tween = gsap.from(lines, { yPercent: 100, stagger: 0.08, ease: 'power3.out' });
    return () => tween.revert();
  }}
>
  Text that knows where its lines break
</SplitText>
```

A resize that moves no word to another line does not call `onSplit` again.

You can also return the animation itself. When the lines change while it plays, say the window is resized halfway through a reveal, it is reverted, and the animation returned for the new lines starts where it had got to. If it had finished, the new one starts finished, so the new lines are simply in place.

```tsx
<SplitText
  as="h1"
  mask
  onSplit={({ lines }) =>
    gsap.from(lines, {
      yPercent: 100,
      stagger: 0.08,
      ease: 'power3.out',
      scrollTrigger: { trigger: lines[0], start: 'top 85%' },
    })
  }
>
  Text that knows where its lines break
</SplitText>
```

Any GSAP tween or timeline works, and so does anything else with `totalTime()`, `progress()` and `revert()`.

If the text uses a web font, a split made before the font arrives may have to be redone when it does. `waitForFonts` holds `onSplit` and the `ready` state back until the document's fonts are loaded, so an entrance animation plays once, on the final layout.

### Animating from outside React

Some animations are set up away from the text: a page's entrance, built once for everything on the page, or reveals wired from a single hook by data attributes. `followSplit` lets that code follow a split it did not render.

```tsx
import { followSplit } from 'splittext-react';

useEffect(() => {
  const stops = Array.from(document.querySelectorAll('[data-reveal]'), (element) =>
    followSplit(element, ({ lines }) => gsap.from(lines, { yPercent: 100, stagger: 0.08 })),
  );
  return () => stops.forEach((stop) => stop());
}, []);
```

Give it the root element of a `SplitText`. The callback is called right away if the text is split already, or as soon as it is, and again each time the lines change. What it returns is handled as for `onSplit`: a cleanup function, or an animation the next split takes over. The function `followSplit` returns stops following and undoes the last thing the callback set up.

### Rendering the elements yourself

Each level has a render prop. Spread `props` on the element you return: it carries the attribute and the `display` style that measuring relies on.

```tsx
import { motion } from 'motion/react';

<SplitText
  mask
  renderLine={({ props, children, index }) => (
    <motion.span
      {...props}
      initial={{ y: '110%' }}
      animate={{ y: 0 }}
      transition={{ delay: index * 0.08 }}
    >
      {children}
    </motion.span>
  )}
>
  Text that knows where its lines break
</SplitText>;
```

## Props

| Prop | Type | Default | |
| --- | --- | --- | --- |
| `as` | element or component | `'div'` | The root. A component has to forward its ref to a DOM element. |
| `split` | `'lines' \| 'words' \| 'chars'`, or an array of them | `['lines', 'words']` | What to split into. Words are always wrapped: they are what lines are measured with. Without `'lines'` nothing is measured or observed at all. |
| `mask` | `boolean` | `false` | Wrap each line in an `overflow: clip` element. |
| `cssVars` | `boolean` | `false` | Set `--line-index`, `--word-index`, `--char-index` on the elements and `--line-total`, `--word-total`, `--char-total` on the root. |
| `aria` | `'auto' \| 'hidden' \| 'none'` | `'auto'` | See [Accessibility](#accessibility). |
| `autoSplit` | `boolean` | `true` | Re-split when the available width changes or fonts load. When `false`, lines are measured on mount and when the text changes, and that's all. |
| `waitForFonts` | `boolean` | `false` | Hold back `onSplit` and `data-split-state="ready"` until fonts have loaded. |
| `breakAfterHyphens` | `boolean` | `true` | Let a line break after a hyphen or dash inside a word, as the browser does with the text unsplit. `false` keeps a hyphenated word whole. |
| `lineClassName`, `wordClassName`, `charClassName`, `maskClassName` | `string` | | Class names for the generated elements. |
| `renderLine`, `renderWord`, `renderChar` | `(info) => ReactElement` | | Render an element yourself. `info` has `props`, `children` and `index`, plus `total` for lines, `text` for words, `char` and `wordIndex` for characters. |
| `onSplit` | `(result) => void \| (() => void) \| animation` | | Called with `{ root, lines, words, chars }` after each split. Return a cleanup function, or an animation for the next split to take over. |

Every other prop, and the `ref`, goes to the root element.

To keep an element from being split, give it `data-split-ignore`. It is then treated as a single unbreakable box.

## How it stays right

**On mount**, the words are rendered in a single line element that takes no part in layout (`display: contents`), so they flow exactly as unsplit text would. That is also what the server sends. A layout effect reads the position of every word, and the lines are in place before the first paint.

**Afterwards**, three things can start a re-split:

- the window is resized. The work is done in the frame the resize is delivered in, so lines never trail the window.
- a `ResizeObserver` reports that the root changed size. That covers containers that change for other reasons (a sidebar opening, a parent animating) and text that was hidden when it mounted. This path takes one frame longer, because measuring inside the observer's own callback is what causes "ResizeObserver loop" errors.
- `document.fonts` reports that fonts finished loading.

Height counts as much as width. A font size set in `vw` re-flows text inside a container whose width never changes; the changed height is what gives it away.

To measure again, the line elements are switched to `display: contents` for a moment, the words are read, and the lines are switched back, all before the browser paints. React re-renders only if a word ended up on a different line.

## Performance

Reading layout is cheap; alternating reads and writes is not, because each read after a write makes the browser lay the page out again. So the work of all instances is pooled and done in phases: all checks, then all writes, then all reads, then one React update.

- **Mounting** any number of instances together causes two layouts.
- **A resize frame** causes a fixed number of layouts however many instances changed.
- **Nothing changed, nothing done.** An instance whose size did not change costs one size read. One whose size changed, but whose lines provably still hold (no line has wrapped, no line has room for the next word), is skipped without writing anything.
- **Offscreen instances wait.** While the window is being resized, only text near the viewport is re-split each frame. The rest is brought up to date once resizing pauses, a few milliseconds per frame.
- **No per-instance listeners.** One `ResizeObserver`, one `IntersectionObserver`, one `resize` listener and one font listener serve the whole page, and are removed when the last instance unmounts.

Splitting into characters is what makes text expensive, in any library: every character becomes a box. Use it for headings, not for body copy.

## Server rendering

It works as is. The package is marked `'use client'`, so it can be imported from a server component in the Next.js App Router, and the text a server component gives it, nested elements included, is split the same on the server and on the client.

The server renders words and characters, and one unmeasured line. Lines are measured on the client before the first paint after hydration; the height of the text does not change when they are added.

## Accessibility

Screen readers tend to read split text word by word or letter by letter. With the default `aria="auto"`, the root gets an `aria-label` with the full text and the split elements get `aria-hidden`.

Hidden elements can't be reached by assistive technology, so if the text contains links or other interactive elements, use `aria="none"` and decide for yourself. Splitting into lines and words only is usually read correctly as is; characters are not.

`aria="hidden"` hides the whole element, for decorative text.

## Limitations

- **The root has to be a block.** `display: flex`, `grid` or `inline` on the root will not work; wrap it instead.
- **Words don't break.** A word is an inline-block, so `hyphens` and `overflow-wrap` have no effect inside one. Breaks after hyphens and dashes are kept: `state-of-the-art` becomes four word elements with no space between them. With `breakAfterHyphens={false}` it stays one word, and moves to the next line whole.
- **Characters lose kerning and ligatures**, and scripts with joined letters (Arabic, Devanagari) should not be split into characters.
- **Not supported:** `text-indent`, `text-align: justify`, vertical writing modes.
- **Don't give line elements horizontal padding, borders or margins.** Lines are measured as if they weren't there.
- **`text-wrap: balance` works**, and lines stay balanced, but browsers balance a row of boxes slightly differently from plain text, so a word can sit on a different line than in the unsplit text.
- **A component used inside the text has to render its `children`** for its content to be split. Otherwise it is treated as one box.
- **Elements are re-created when a word moves to another line.** Set animations up in `onSplit` or `followSplit` rather than once on mount.
- **A root that shrinks to fit its lines** (a centered flex item, `width: fit-content`) is followed when the window is resized, but can't be told that it has more room when something else makes its container grow.
- `SplitText` can not be nested inside `SplitText`.

## Development

```sh
pnpm install
pnpm exec playwright install chromium firefox webkit

pnpm dev          # playground at localhost:5173
pnpm test         # unit tests, and layout tests in three real browsers
pnpm typecheck
pnpm build
```

Line breaking can only be tested where there is a layout engine, so most of the tests run in real browsers and compare the split against how the same browser breaks the same text unsplit.

## License

MIT
