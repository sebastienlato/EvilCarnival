import { useEffect, useRef } from 'react';
import { useProgress } from '@react-three/drei';
import { bridge, ride, useUI } from '../state/ride';
import { audio } from '../lib/audio';
import { clamp } from '../lib/utils';
import { flashScreen } from '../scene/Director';

async function enter() {
  const ui = useUI.getState();
  if (ui.phase !== 'ready') return;
  ui.set({ phase: 'entering' });
  audio.start(ui.sound);
  flashScreen('#ffcf7a', 0.35, 700);
  ride.entered = true;
  ride.tearDrag = 0;
  document.body.classList.remove('is-loading');
  document.body.classList.add('is-entered');
  await bridge.tear();
  useUI.getState().set({ phase: 'entered' });
}

export function Loader() {
  const phase = useUI((s) => s.phase);
  const label = useUI((s) => s.loadLabel);
  const set = useUI((s) => s.set);
  const { progress } = useProgress();
  const btn = useRef<HTMLButtonElement>(null);

  // asset progress drives the bar; the last stretch is shader compilation
  const pct = phase === 'loading' ? Math.min(progress * 0.94, 94) : 100;
  useEffect(() => { if (phase === 'loading') set({ progress: pct / 100 }); }, [pct, phase, set]);
  useEffect(() => { if (phase === 'ready') btn.current?.focus({ preventScroll: true }); }, [phase]);

  // drag anywhere to peel the stub off the ticket
  const drag = useRef<{ x: number; y: number; id: number } | null>(null);
  useEffect(() => {
    const down = (e: PointerEvent) => {
      if (useUI.getState().phase !== 'ready' || (e.target as HTMLElement).closest('button')) return;
      drag.current = { x: e.clientX, y: e.clientY, id: e.pointerId };
      audio.start(useUI.getState().sound); // a pointer press is a user gesture: wake the audio
    };
    const move = (e: PointerEvent) => {
      const d = drag.current;
      if (!d || e.pointerId !== d.id) return;
      const dist = Math.hypot(e.clientX - d.x, (e.clientY - d.y) * 0.8);
      const k = clamp(dist / Math.min(260, innerWidth * 0.45));
      if (k > ride.tearDrag + 0.04) audio.rip(k);
      ride.tearDrag = k;
      if (k >= 0.7) { drag.current = null; enter(); }
    };
    const up = () => { if (drag.current) { drag.current = null; ride.tearDrag = 0; } };
    addEventListener('pointerdown', down);
    addEventListener('pointermove', move);
    addEventListener('pointerup', up);
    addEventListener('pointercancel', up);
    return () => { removeEventListener('pointerdown', down); removeEventListener('pointermove', move); removeEventListener('pointerup', up); removeEventListener('pointercancel', up); };
  }, []);

  const gone = phase === 'entering' || phase === 'entered';
  return (
    <div id="loader" className={gone ? 'is-gone' : ''} role="dialog" aria-label="Loading the carnival">
      <div className="loader__top"><span className="kicker">Est. 1896 · Re-opened tonight</span></div>
      <div className="loader__bottom">
        <p className="loader__status"><span>{label}</span> <span className="pct">{Math.round(pct)}%</span></p>
        <div className="loader__bar"><i style={{ width: `${pct}%` }} /></div>
        <button ref={btn} className="btn btn--tear" type="button" disabled={phase !== 'ready'} onClick={enter}>
          <span>Tear to enter</span>
        </button>
        <p className="loader__hint">{phase === 'ready' ? 'Or grab the ticket and rip the stub off.' : 'Sound on. Best with headphones. Lights off.'}</p>
      </div>
    </div>
  );
}
