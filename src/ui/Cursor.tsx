import { useEffect, useRef } from 'react';
import { isTouch, damp } from '../lib/utils';
import { onTick } from '../lib/ticker';
import { url } from '../three/assets';

/** A white clown glove on a spring; it swells over anything clickable, 2D or 3D. */
export function Cursor() {
  const el = useRef<HTMLImageElement>(null);
  useEffect(() => {
    if (isTouch()) return;
    document.body.classList.add('has-cursor');
    const c = { x: innerWidth / 2, y: innerHeight / 2, tx: innerWidth / 2, ty: innerHeight / 2, rot: 0, press: 0, hover: 0, ui: false };
    const move = (e: PointerEvent) => { c.tx = e.clientX; c.ty = e.clientY; c.ui = !!(e.target as HTMLElement).closest?.('button, a, label, input'); };
    const down = () => { c.press = 1; };
    addEventListener('pointermove', move, { passive: true });
    addEventListener('pointerdown', down);
    let last = performance.now(), style = '';
    const off = onTick((now) => {
      const dt = Math.min((now - last) / 1000, 0.05); last = now;
      c.x = damp(c.x, c.tx, 22, dt); c.y = damp(c.y, c.ty, 22, dt);
      c.rot = damp(c.rot, Math.max(-25, Math.min(25, (c.tx - c.x) * 0.6)), 10, dt);
      c.press = damp(c.press, 0, 10, dt);
      const hover3d = document.body.classList.contains('is-hover3d');
      c.hover = damp(c.hover, c.ui || hover3d ? 1 : 0, 12, dt);
      const s = 1 - c.press * 0.18 + c.hover * 0.12;
      // rounded so a glove at rest stops touching the DOM
      const next = `translate3d(${(c.x - 4).toFixed(1)}px, ${(c.y - 2).toFixed(1)}px, 0) rotate(${(c.rot - c.hover * 12).toFixed(2)}deg) scale(${s.toFixed(3)})`;
      if (next !== style && el.current) el.current.style.transform = style = next;
    });
    return () => { off(); removeEventListener('pointermove', move); removeEventListener('pointerdown', down); };
  }, []);
  return <img id="cursor" ref={el} src={url('cursor_glove')} alt="" aria-hidden="true" />;
}
