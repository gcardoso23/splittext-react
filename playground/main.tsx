import { StrictMode, useRef, useState, type ReactElement, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { SplitText } from '@gcardoso23/splittext-react';

const PARAGRAPH =
  'Line breaks are never guessed. The browser lays the words out, the library reads where they landed, and every line gets an element of its own that follows the container as it changes.';

function Section({ label, children }: { label: string; children: ReactNode }): ReactElement {
  return (
    <section>
      <p className="label">{label}</p>
      {children}
    </section>
  );
}

/** Flips a class a frame after mounting and on demand, to run CSS transitions. */
function useReplay(): [boolean, () => void] {
  const [on, setOn] = useState(true);
  const replay = (): void => {
    setOn(false);
    requestAnimationFrame(() => requestAnimationFrame(() => setOn(true)));
  };
  return [on, replay];
}

function Hero(): ReactElement {
  const [on, replay] = useReplay();
  return (
    <Section label="Lines, masked, staggered in CSS">
      <div className="row">
        <button onClick={replay}>Replay</button>
      </div>
      <SplitText as="h1" className={`hero reveal ${on ? 'is-in' : ''}`} mask cssVars>
        Text that knows where its lines break
      </SplitText>
    </Section>
  );
}

function Characters(): ReactElement {
  const [on, replay] = useReplay();
  return (
    <Section label="Characters, staggered by --char-index">
      <div className="row">
        <button onClick={replay}>Replay</button>
      </div>
      <SplitText
        as="p"
        className={`lede stagger ${on ? 'is-in' : ''}`}
        split={['words', 'chars']}
        cssVars
      >
        Words stay whole, so characters never break in the middle of one. Emoji too: 👩‍🚀 🇧🇷
      </SplitText>
    </Section>
  );
}

function Resizable(): ReactElement {
  const [splits, setSplits] = useState(0);
  return (
    <Section label="Drag the corner: lines follow the container">
      <p className="stats">onSplit calls: {splits} (only when a line actually changes)</p>
      <div className="resizable outlined">
        <SplitText onSplit={() => setSplits((count) => count + 1)}>{PARAGRAPH}</SplitText>
      </div>
    </Section>
  );
}

function Centered(): ReactElement {
  return (
    <Section label="A root that shrinks to fit (flex, align-items: center)">
      <div className="centered outlined">
        <SplitText as="h2" style={{ margin: 0 }}>
          Centered headings keep re-flowing when the window grows
        </SplitText>
      </div>
    </Section>
  );
}

function LateFont(): ReactElement {
  const [state, setState] = useState<'idle' | 'loading' | 'loaded' | 'failed'>('idle');
  const load = async (): Promise<void> => {
    setState('loading');
    const face = new FontFace(
      'Playground Late',
      'local("Georgia"), local("Times New Roman"), local("DejaVu Serif")',
    );
    document.fonts.add(face);
    try {
      await face.load();
      setState('loaded');
    } catch {
      setState('failed');
    }
  };
  return (
    <Section label="A font that arrives late">
      <div className="row">
        <button onClick={load} disabled={state !== 'idle'}>
          Load the font
        </button>
        <span className="stats">font: {state}</span>
      </div>
      <SplitText className="late-font outlined">
        This starts in a monospaced fallback and is split again the moment the real font is in.
      </SplitText>
    </Section>
  );
}

function Rich(): ReactElement {
  return (
    <Section label="Nested elements survive, even across lines">
      <SplitText as="p" className="lede outlined" aria="none" style={{ maxWidth: '26rem' }}>
        An <em>emphasised phrase that is long enough to wrap</em> stays emphasised on both lines,
        <br />a forced break is kept, and <a href="#top">links still work</a>.
      </SplitText>
    </Section>
  );
}

function Many(): ReactElement {
  const [count, setCount] = useState(60);
  const splits = useRef(0);
  const [, refresh] = useState(0);
  return (
    <Section label="Lots of them">
      <div className="row">
        {[60, 200, 500].map((option) => (
          <button key={option} onClick={() => setCount(option)}>
            {option}
          </button>
        ))}
        <button onClick={() => refresh((value) => value + 1)}>Refresh counter</button>
        <span className="stats">
          {count} instances, {splits.current} splits so far
        </span>
      </div>
      <div className="grid">
        {Array.from({ length: count }, (_, index) => (
          <SplitText key={index} as="p" onSplit={() => void splits.current++}>
            {`${index + 1}. ${PARAGRAPH}`}
          </SplitText>
        ))}
      </div>
    </Section>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <main id="top">
      <Hero />
      <Characters />
      <Resizable />
      <Centered />
      <LateFont />
      <Rich />
      <Many />
    </main>
  </StrictMode>,
);
