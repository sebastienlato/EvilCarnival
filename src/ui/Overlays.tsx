import { type ReactNode, useEffect, useMemo, useState } from 'react';
import { T } from '../config';
import { bridge, ride, useUI } from '../state/ride';
import { onTick } from '../lib/ticker';

/** Letters switch on like marquee bulbs; a few never quite catch. */
export function FlickerText({ text, as: Tag = 'h2', className = '', dead = false }: { text: string; as?: 'h2' | 'p' | 'span'; className?: string; dead?: boolean }) {
  const words = useMemo(() => {
    let i = 0;
    return text.split(' ').map((w) => [...w].map((ch) => ({ ch, d: (0.05 + i++ * 0.035 + Math.random() * 0.25).toFixed(2), dead: dead && Math.random() < 0.07 })));
  }, [text, dead]);
  return (
    <Tag className={`flicker ${className}`} aria-label={text}>
      {words.map((w, wi) => (
        <span key={wi} className="word" aria-hidden="true">
          {w.map((l, li) => <span key={li} className={`ch${l.dead ? ' is-dead' : ''}`} style={{ ['--d' as string]: `${l.d}s` }}>{l.ch}</span>)}
          {wi < words.length - 1 && <span className="sp"> </span>}
        </span>
      ))}
    </Tag>
  );
}

function Ov({ from, to, className, children }: { from: number; to: number; className: string; children: ReactNode }) {
  const [on, setOn] = useState(false);
  useEffect(() => {
    let last = false;
    return onTick(() => {
      const want = ride.entered && ride.t >= from && ride.t <= to;
      if (want !== last) setOn((last = want));
    });
  }, [from, to]);
  return <section className={`ov ${className} ${on ? 'is-active' : ''}`} aria-hidden={!on}>{children}</section>;
}

function Webcam() {
  const webcam = useUI((s) => s.webcam);
  const set = useUI((s) => s.set);
  const label = { off: 'Look into the mirror', pending: 'The glass is waking…', on: 'The mirror sees you', denied: 'The mirror is shy (no camera)' }[webcam];
  return (
    <button className="btn" type="button" disabled={webcam === 'pending' || webcam === 'on'} onClick={async () => {
      set({ webcam: 'pending' });
      const ok = await bridge.enableWebcam();
      set({ webcam: ok ? 'on' : 'denied' });
      useUI.getState().toastMsg(ok ? 'Hold still. Something is behind you.' : 'No camera. It sees you anyway.');
    }}>{label}</button>
  );
}

function FortunePanel() {
  const fortune = useUI((s) => s.fortune);
  const busy = useUI((s) => s.fortuneBusy);
  const cardOut = useUI((s) => s.cardOut);
  return (
    <article className="playbill playbill--fortune">
      <p className="playbill__num">Attraction Nº III</p>
      <FlickerText className="playbill__title" text="Madame Cackle" />
      <p>She has read eleven thousand palms. She kept four.</p>
      <div className={`fortune__result ${fortune ? 'has-card' : ''}`} aria-live="polite">
        {fortune && (
          <>
            <p className="fortune__card">{fortune.name}</p>
            <p className="fortune__text" key={fortune.key}>
              {[...fortune.text].map((c, i) => <span key={i} className="ch" style={{ ['--d' as string]: `${i * 0.022}s` }}>{c}</span>)}
            </p>
          </>
        )}
      </div>
      <div className="row">
        <button className="btn" type="button" disabled={busy} onClick={() => bridge.dispense()}>{fortune ? 'Insert another soul' : 'Insert one soul'}</button>
        {cardOut && <button className="btn btn--ghost" type="button" onClick={() => bridge.dismissCard()}>Put the card away</button>}
      </div>
      {cardOut && <p className="fine">Click the card to put it away.</p>}
    </article>
  );
}

function Finale() {
  const open = useUI((s) => s.finaleTicket);
  const set = useUI((s) => s.set);
  const golden = useUI((s) => s.golden);
  if (!open) {
    return (
      <button className="btn btn--small finale-reopen" type="button" onClick={() => set({ finaleTicket: true })}>Show my ticket</button>
    );
  }
  return (
    <article className="playbill playbill--finale">
      <button className="close" type="button" aria-label="Close" onClick={() => bridge.dismissFinaleTicket()}>×</button>
      <p className="playbill__num">Box Office · Final Call</p>
      <FlickerText className="playbill__title" text={golden ? 'Your Golden Ticket' : 'Admit One Soul'} />
      <p>{golden ? 'Thirteen balloons popped. The Ringmaster is impressed. That is rarely good news.' : 'Gates open at midnight, October 13 through 31. Doors lock behind you.'}</p>
      <button className="btn btn--big" type="button" onClick={() => set({ boxOffice: true })}>Open the box office</button>
      <p className="fine">Click the ticket to put it away.</p>
    </article>
  );
}

export function Overlays() {
  const darkHint = useUI((s) => s.darkHint);
  return (
    <main id="overlays">
      <Ov from={0} to={0.045} className="ov--hero">
        <p className="hero__tag">The carnival that never leaves town.<br /><em>Neither will you.</em></p>
        <p className="hero__dates"><span>Oct 13 — Oct 31</span><span className="dot">✶</span><span>Gates open at midnight</span></p>
        <div className="scroll-cue" aria-hidden="true"><span>Scroll to be swallowed</span><i /></div>
      </Ov>

      <Ov from={0.175} to={0.325} className="ov--panel ov--left">
        <article className="playbill">
          <p className="playbill__num">Attraction Nº I</p>
          <FlickerText className="playbill__title" text="The Carousel of the Damned" />
          <p>Twelve mounts. None of them were carved. Ride the skeletal stallion, the grinning goat or the clown-faced serpent, and try not to notice the music slowing down whenever you stop moving.</p>
          <dl className="stats">
            <div><dt>Rotation</dt><dd>3 RPM</dd></div>
            <div><dt>Restraints</dt><dd>Decorative</dd></div>
            <div><dt>Exit</dt><dd>Rumoured</dd></div>
          </dl>
          <p className="aside">Scroll faster. <em>They like it.</em></p>
        </article>
      </Ov>

      <Ov from={0.385} to={0.442} className="ov--panel ov--right">
        <article className="playbill">
          <p className="playbill__num">Attraction Nº II</p>
          <FlickerText className="playbill__title" text="Hall of Mirrors" />
          <p>Forty-four mirrors. Forty-three reflections. Stand still long enough and the glass starts to remember you.</p>
          <Webcam />
          <p className="fine">Uses your camera. The feed never leaves your browser.</p>
        </article>
      </Ov>

      <Ov from={0.497} to={0.53} className="ov--shout">
        <h2 className="shout shout--whisper">Don’t turn around.</h2>
      </Ov>

      <Ov from={0.565} to={0.64} className="ov--panel ov--right">
        <FortunePanel />
      </Ov>

      <Ov from={0.65} to={0.735} className="ov--panel ov--left">
        <article className="playbill">
          <p className="playbill__num">The Banner Line</p>
          <FlickerText className="playbill__title" text="Tonight's Acts" />
          <ul className="acts">
            <li><strong>Belladonna the Boneless</strong><span>She bends. You break.</span></li>
            <li><strong>The Giggling Gemini</strong><span>Two clowns. One smile.</span></li>
            <li><strong>Maestro Marrow</strong><span>Knives without mercy.</span></li>
          </ul>
          <p className="aside">Every act, every night, since 1896. <em>Same performers.</em></p>
        </article>
      </Ov>

      <section className={`ov ov--dark ${darkHint ? 'is-active' : ''}`} aria-hidden={!darkHint}>
        <p className="dark-hint"><span>The house lights are out.</span> <em>Move your light. Count the eyes.</em></p>
      </section>

      <Ov from={0.785} to={0.835} className="ov--shout ov--ring">
        <p className="kicker">Attraction Nº IV · The Big Top</p>
        <FlickerText as="h2" className="shout" text="The Ringmaster will see you now" dead />
        <p className="sub">Showtime is midnight. It has been midnight for 128 years.</p>
      </Ov>

      <Ov from={0.875} to={0.935} className="ov--shout">
        <p className="kicker">Attraction Nº V · The Wheel</p>
        <FlickerText as="h2" className="shout" text="Ride to the very top" dead />
        <p className="sub">Getting down is a separate attraction.</p>
      </Ov>

      <Ov from={T.top - 0.012} to={1.01} className="ov--cta">
        <Finale />
      </Ov>
    </main>
  );
}
