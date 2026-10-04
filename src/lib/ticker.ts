/*
 * One requestAnimationFrame loop for all DOM-side per-frame work (rail, overlays,
 * cursor), instead of one loop per component. It stops itself when nobody listens.
 */
type Tick = (now: number) => void;
const subs = new Set<Tick>();
let raf = 0;

const loop = (now: number) => {
  for (const f of subs) f(now);
  raf = subs.size ? requestAnimationFrame(loop) : 0;
};

export function onTick(f: Tick) {
  subs.add(f);
  if (!raf) raf = requestAnimationFrame(loop);
  return () => { subs.delete(f); };
}

/*
 * Scroll metrics, cached from events. Reading scrollY / scrollHeight inside the
 * render loop would force a synchronous layout every frame, right after the DOM
 * chrome has written its styles.
 */
export const scroll = { y: 0, max: 1 };
if (typeof window !== 'undefined') {
  const measure = () => {
    scroll.y = scrollY;
    scroll.max = Math.max(1, document.documentElement.scrollHeight - innerHeight);
  };
  addEventListener('scroll', () => { scroll.y = scrollY; }, { passive: true });
  addEventListener('resize', measure);
  new ResizeObserver(measure).observe(document.documentElement);
  measure();
}
