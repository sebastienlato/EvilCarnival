import { useEffect, useRef, useState } from 'react';
import { GOLDEN_TIER, TIERS } from '../config';
import { bridge, useUI } from '../state/ride';
import { audio } from '../lib/audio';
import { flashScreen } from '../scene/Director';
import { url } from '../three/assets';

/**
 * The box office. Opens from the header, closes with ×, Esc, a click outside,
 * or by clicking the ticket itself (which tears in half on the way out).
 */
export function BoxOffice() {
  const open = useUI((s) => s.boxOffice);
  const golden = useUI((s) => s.golden);
  const set = useUI((s) => s.set);
  const [tier, setTier] = useState<string>('general');
  const [tearing, setTearing] = useState(false);
  const [claimed, setClaimed] = useState<string | null>(null);
  const ticket = useRef<HTMLButtonElement>(null);
  const closeBtn = useRef<HTMLButtonElement>(null);
  const lastFocus = useRef<Element | null>(null);

  const close = () => {
    if (!open || tearing) return;
    setTearing(true);
    audio.tear();
    setTimeout(() => { set({ boxOffice: false }); setTearing(false); setClaimed(null); }, 650);
  };

  useEffect(() => {
    if (!open) { (lastFocus.current as HTMLElement | null)?.focus?.(); return; }
    lastFocus.current = document.activeElement;
    closeBtn.current?.focus();
    if (golden) setTier('golden');
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  // holographic tilt that follows the pointer
  const onMove = (e: React.PointerEvent) => {
    const el = ticket.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width - 0.5, y = (e.clientY - r.top) / r.height - 0.5;
    el.style.setProperty('--rx', `${-y * 18}deg`);
    el.style.setProperty('--ry', `${x * 22}deg`);
    el.style.setProperty('--mx', `${(x + 0.5) * 100}%`);
    el.style.setProperty('--my', `${(y + 0.5) * 100}%`);
  };

  const claim = async () => {
    const all = golden ? [GOLDEN_TIER, ...TIERS] : TIERS;
    const chosen = all.find((t) => t.id === tier) ?? TIERS[0];
    audio.claim();
    if (chosen.id === 'golden') audio.golden();
    flashScreen(chosen.id === 'golden' ? '#ffcf5a' : '#c4122a', 0.45, 900);
    setClaimed(chosen.name);
    bridge.claim();
    useUI.getState().toastMsg(`${chosen.name} reserved. Don't be late. You can't be.`);
  };

  if (!open) return null;
  const tiers = golden ? [GOLDEN_TIER, ...TIERS] : TIERS;
  return (
    <div className={`boxoffice ${tearing ? 'is-closing' : ''}`} role="dialog" aria-modal="true" aria-label="Box office" onPointerDown={(e) => { if (e.target === e.currentTarget) close(); }}>
      <div className="boxoffice__inner">
        <button ref={ticket} type="button" className={`bo-ticket ${tearing ? 'is-tearing' : ''} ${tier === 'golden' ? 'is-golden' : ''} ${claimed ? 'is-stamped' : ''}`}
          onPointerMove={onMove} onPointerLeave={() => ticket.current?.style.setProperty('--rx', '0deg')} onClick={close} aria-label="Your ticket (click to put it away)">
          <span className="bo-ticket__half bo-ticket__main" style={{ backgroundImage: `url(${url('ticket_front')})` }} />
          <span className="bo-ticket__half bo-ticket__stub" style={{ backgroundImage: `url(${url('ticket_front')})` }} />
          <span className="bo-ticket__holo" />
          {claimed && <span className="bo-ticket__stamp">Admitted</span>}
        </button>
        <article className="playbill playbill--wide">
          <button ref={closeBtn} className="close" type="button" aria-label="Close the box office" onClick={close}>×</button>
          <p className="playbill__num">Box Office · Midnight Window</p>
          <h2 className="playbill__title">Admit One Soul</h2>
          <div className="tiers" role="radiogroup" aria-label="Ticket tier">
            {tiers.map((t) => (
              <label key={t.id} className={`tier ${t.id === 'last' ? 'tier--last' : ''} ${t.id === 'golden' ? 'tier--golden' : ''}`}>
                <input type="radio" name="tier" value={t.id} checked={tier === t.id} onChange={() => setTier(t.id)} />
                <span className="tier__name">{t.name}</span>
                <span className="tier__price">{t.price}</span>
                <span className="tier__note">{t.note}</span>
              </label>
            ))}
          </div>
          <button className="btn btn--big" type="button" onClick={claim}>{claimed ? 'Claim another soul' : 'Claim your ticket'}</button>
          <p className="fine">HOLLOWGRIN is a fictional attraction. No clowns were harmed. Several were fed. Click the ticket, press Esc, or click outside to close.</p>
        </article>
      </div>
    </div>
  );
}
