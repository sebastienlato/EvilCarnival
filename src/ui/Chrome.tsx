import { useEffect, useRef } from 'react';
import { CHAPTERS, POPS_FOR_GOLDEN } from '../config';
import { bridge, ride, useUI } from '../state/ride';
import { audio } from '../lib/audio';
import { onTick } from '../lib/ticker';

/** Header (brand, sound, tickets), chapter rail, balloon counter. */
export function Chrome() {
  const sound = useUI((s) => s.sound);
  const pops = useUI((s) => s.pops);
  const golden = useUI((s) => s.golden);
  const set = useUI((s) => s.set);
  const fill = useRef<HTMLElement>(null);
  const btns = useRef<(HTMLButtonElement | null)[]>([]);

  // rail follows the ride without React re-rendering every frame (a transform, so no layout)
  useEffect(() => {
    let current = -1, lastT = -1;
    return onTick(() => {
      const t = Math.min(ride.t, 1);
      if (t === lastT) return;
      lastT = t;
      if (fill.current) fill.current.style.transform = `scaleY(${t})`;
      let c = 0;
      CHAPTERS.forEach((ch, i) => { if (t >= ch.t - 0.02) c = i; });
      if (c !== current) {
        current = c;
        btns.current.forEach((b, i) => b?.classList.toggle('is-current', i === c));
      }
    });
  }, []);

  const toggleSound = () => {
    const on = !sound;
    set({ sound: on });
    audio.setEnabled(on);
  };

  return (
    <>
      <header className="chrome">
        <a className="brand" href="#" onClick={(e) => { e.preventDefault(); bridge.rideTo(0); }} aria-label="HOLLOWGRIN, back to the gate">
          <span className="brand__word">HOLLOWGRIN</span>
          <span className="brand__sub">Midnight Carnival</span>
        </a>
        <div className="chrome__right">
          {pops > 0 && (
            <span className={`pops ${golden ? 'is-golden' : ''}`} title="Balloons popped" aria-label={`${pops} balloons popped`}>
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2c4 0 7 3.1 7 7.2 0 4.4-3.6 8.3-6.2 8.8l.8 1.6h-3.2l.8-1.6C8.6 17.5 5 13.6 5 9.2 5 5.1 8 2 12 2z" /><path className="str" d="M12 19.6c-.6 1.2.8 1.7 0 2.4" /></svg>
              {golden ? 'Golden' : `${pops}/${POPS_FOR_GOLDEN}`}
            </span>
          )}
          <button className="icon-btn" type="button" aria-pressed={sound} aria-label="Toggle sound" onClick={toggleSound}>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path className="spk" d="M4 9h4l5-4v14l-5-4H4z" />
              {sound ? <><path d="M16 9c1.2 1 1.2 5 0 6" /><path d="M18.5 6.5c2.6 2.6 2.6 8.4 0 11" /></> : <path d="M16 9l5 6M21 9l-5 6" />}
            </svg>
          </button>
          <button className="btn btn--small" type="button" onClick={() => set({ boxOffice: true })}>Tickets</button>
        </div>
      </header>
      <nav className="rail" aria-label="Chapters">
        <div className="rail__track"><i className="rail__fill" ref={fill} /></div>
        <ol className="rail__list">
          {CHAPTERS.map((c, i) => (
            <li key={c.name}>
              <button type="button" ref={(el) => { btns.current[i] = el; }} aria-label={`Ride to ${c.name}`} onClick={() => bridge.rideTo(c.t)}>
                <span>{c.name}</span>
              </button>
            </li>
          ))}
        </ol>
      </nav>
    </>
  );
}
