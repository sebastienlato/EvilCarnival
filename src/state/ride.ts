import * as THREE from 'three';
import { create } from 'zustand';
import { FORTUNES, type Fortune, POPS_FOR_GOLDEN } from '../config';

/*
 * Two kinds of state:
 *  - `ride`: mutable, per-frame values read inside useFrame (never triggers React renders)
 *  - `useUI`: React state for overlays and chrome (changes a few times per minute)
 */
export const ride = {
  t: 0,
  target: 0,
  vel: 0,
  time: 0,
  dt: 0,
  entered: false,
  /** electrical grid, 0..1: brownouts flicker it */
  power: 1,
  /** scripted house-lights-out, 0..1 */
  darkness: 0,
  /** lightning flash, 0..1+ */
  lightning: 0,
  glitch: 0,
  red: 0,
  duck: 0,
  beat: 0,
  pointer: new THREE.Vector2(),
  pointerRay: new THREE.Ray(),
  pointerActive: false,
  /** 0..1 drag progress of tearing the stub off the loader ticket */
  tearDrag: 0,
  narrow: false,
  quality: 'high' as 'high' | 'low',
  reducedMotion: false,
};

/** Imperative hooks the 3D world registers so the DOM can poke it. */
export const bridge = {
  dispense: async (): Promise<void> => {},
  dismissCard: (): void => {},
  tear: async (): Promise<void> => {},
  enableWebcam: async (): Promise<boolean> => false,
  claim: async (): Promise<void> => {},
  dismissFinaleTicket: (): void => {},
  rideTo: (_t: number): void => {},
};

type Phase = 'loading' | 'ready' | 'entering' | 'entered';

interface UIState {
  phase: Phase;
  progress: number;
  loadLabel: string;
  sound: boolean;
  section: number;
  t: number;
  boxOffice: boolean;
  fortune: Fortune | null;
  fortuneBusy: boolean;
  cardOut: boolean;
  pops: number;
  golden: boolean;
  finaleTicket: boolean;
  toast: { id: number; text: string } | null;
  webcam: 'off' | 'pending' | 'on' | 'denied';
  darkHint: boolean;
  set: (p: Partial<UIState>) => void;
  toastMsg: (text: string) => void;
  pop: () => void;
}

let toastId = 0;
export const useUI = create<UIState>((set, get) => ({
  phase: 'loading',
  progress: 0,
  loadLabel: 'Gathering souls',
  sound: (() => { try { return localStorage.getItem('evilcarnival:sound') !== 'off'; } catch { return true; } })(),
  section: -1,
  t: 0,
  boxOffice: false,
  fortune: null,
  fortuneBusy: false,
  cardOut: false,
  pops: 0,
  golden: false,
  finaleTicket: true,
  toast: null,
  webcam: 'off',
  darkHint: false,
  set: (p) => set(p),
  toastMsg: (text) => set({ toast: { id: ++toastId, text } }),
  pop: () => {
    const pops = get().pops + 1;
    const golden = pops >= POPS_FOR_GOLDEN;
    set({ pops, golden });
    if (pops === POPS_FOR_GOLDEN) get().toastMsg('Thirteen souls. The Golden Ticket is yours: check the box office.');
  },
}));

export const fortuneByKey = (k: string) => FORTUNES.find((f) => f.key === k) ?? FORTUNES[0];
