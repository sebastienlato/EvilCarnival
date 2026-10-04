import { useEffect, useState } from 'react';
import { useUI } from '../state/ride';

export function Toast() {
  const toast = useUI((s) => s.toast);
  const [on, setOn] = useState(false);
  useEffect(() => {
    if (!toast) return;
    setOn(true);
    const id = setTimeout(() => setOn(false), 4200);
    return () => clearTimeout(id);
  }, [toast]);
  return <div id="toast" className={on ? 'is-on' : ''} role="status" aria-live="polite">{toast?.text}</div>;
}
