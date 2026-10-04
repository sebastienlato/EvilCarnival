import * as THREE from 'three';

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

/* World layout. The ride runs from +Z (the gate) toward -Z (the wheel). */
export const LAYOUT = {
  gate: V(0, 0, 0),
  carousel: V(0, 0, -66),
  mirrors: V(22, 0, -104),
  mirrorsFacing: V(-1, 0, 1).normalize(),
  fortune: V(-12, 0, -138),
  fortuneFacing: V(0.55, 0, 1).normalize(),
  banners: [V(7, 0, -147), V(7.6, 0, -155.5), V(7, 0, -164)],
  bigtop: V(-4, 0, -195),
  bigtopRadius: 18,
  wheel: V(-4, 25, -262),
  wheelRadius: 21,
};

/* Story beats, in ride progress (0 → 1). */
export const T = {
  logoHoist: [0.012, 0.07],
  marquee: [0.045, 0.12],
  mirrorsGhost: [0.43, 0.5],
  scare: 0.497,
  blackout: [0.742, 0.782],
  curtainsOpen: [0.775, 0.812],
  ringmasterBurn: [0.817, 0.836],
  board: 0.872,
  panorama: 0.9,
  fireworks: 0.93,
  top: 0.968,
} as const;

export type CameraKey = [number, THREE.Vector3, THREE.Vector3, THREE.Vector3?, THREE.Vector3?];

/*
 * Camera keyframes: [t, position, lookAt, portraitPosition?, portraitLookAt?].
 * Positions and look targets each ride a centripetal Catmull-Rom spline; t is
 * remapped per segment so the camera dwells where the story wants it to.
 */
const M = LAYOUT.mirrors, D = LAYOUT.mirrorsFacing;
const mirrorEye = M.clone().addScaledVector(D, 3.6).setY(4.2);
const aroundMirror = (deg: number) => {
  const back = D.clone().negate().applyAxisAngle(new THREE.Vector3(0, 1, 0), THREE.MathUtils.degToRad(deg));
  return M.clone().addScaledVector(back, 8).setY(3.4);
};
const F = LAYOUT.fortune, FF = LAYOUT.fortuneFacing;
const FR = new THREE.Vector3(FF.z, 0, -FF.x);
const fortuneEye = F.clone().addScaledVector(FF, 5.3).addScaledVector(FR, 0.9).setY(2.9);
const fortuneLook = F.clone().addScaledVector(FR, 1.25).setY(2.35);
const fortuneEyeM = F.clone().addScaledVector(FF, 6.4).setY(2.7);
const fortuneLookM = F.clone().setY(1.25);

export const CAMERA_KEYS: CameraKey[] = [
  [0.0, V(0, 5.2, 38), V(0, 12.4, 0)],
  [0.05, V(0, 5.3, 27), V(0, 10.6, 0)],
  [0.092, V(0, 5.6, 11), V(0, 6.8, -10)],
  [0.122, V(0, 5.4, -2), V(0, 6.2, -30)],
  [0.165, V(0.6, 5.0, -21), V(0, 4.6, -66)],
  [0.215, V(-6, 4.4, -46), V(0, 4.4, -66)],
  [0.265, V(-16.5, 5.6, -63), V(0, 4.6, -66)],
  [0.315, V(-11, 7.8, -84), V(0, 4.2, -66)],
  [0.36, V(3, 5.4, -95), V(18, 4, -104)],
  [0.4, mirrorEye.clone(), aroundMirror(0)],
  [0.445, mirrorEye.clone().addScaledVector(D, -0.4), aroundMirror(-38)],
  [0.49, mirrorEye.clone().addScaledVector(D, -0.6), aroundMirror(34)],
  [0.5, mirrorEye.clone().addScaledVector(D, -0.6), aroundMirror(8)],
  [0.511, mirrorEye.clone().addScaledVector(D, -0.5), aroundMirror(100)],
  [0.522, mirrorEye.clone().addScaledVector(D, -0.4), aroundMirror(178).setY(4.2)],
  [0.548, V(6, 4.6, -121), V(-12, 3, -138)],
  [0.578, fortuneEye.clone(), fortuneLook.clone(), fortuneEyeM.clone(), fortuneLookM.clone()],
  [0.632, fortuneEye.clone().addScaledVector(FF, -0.25), fortuneLook.clone(), fortuneEyeM.clone().addScaledVector(FF, -0.25), fortuneLookM.clone()],
  [0.662, V(-3, 4.6, -146), V(7, 4.9, -148)],
  [0.695, V(-3, 4.6, -152), V(7.6, 4.9, -155.5)],
  [0.728, V(-3, 4.6, -158), V(7, 4.9, -164)],
  [0.752, V(-4, 5.2, -170), V(-4, 5.4, -213)],
  [0.79, V(-4, 4.6, -186), V(-4, 5.4, -213)],
  [0.82, V(-4, 4.3, -199.5), V(-4, 5.0, -213)],
  [0.846, V(-4, 4.8, -215), V(-4, 11, -262)],
  [0.862, V(-2, 4.2, -242), V(24, 6, -252)],
  [T.board, V(-4, 3.4, -256.5), V(-4, 6, -200)],
];

export const TOP_LOOK = V(-1, 24, -70);

export const CHAPTERS = [
  { name: 'The Gate', t: 0.0 },
  { name: 'The Carousel', t: 0.22 },
  { name: 'Hall of Mirrors', t: 0.405 },
  { name: 'Madame Cackle', t: 0.585 },
  { name: 'The Acts', t: 0.664 },
  { name: 'The Big Top', t: 0.745 },
  { name: 'The Wheel', t: 0.9 },
  { name: 'Finale', t: 0.985 },
];

export interface Fortune { key: string; name: string; text: string }
export const FORTUNES: Fortune[] = [
  { key: 'card_the_jester', name: '0 · The Jester', text: 'You will laugh at something you shouldn’t. Soon. Loudly. Alone.' },
  { key: 'card_the_ringmaster', name: 'IV · The Ringmaster', text: 'Someone has already bought your ticket. They paid in full. They are waiting at the gate.' },
  { key: 'card_the_red_balloon', name: 'XVIII · The Red Balloon', text: 'What floats away always comes back. Check the ceiling tonight.' },
  { key: 'card_the_wheel', name: 'X · The Wheel', text: 'You will ride to the very top. Getting down is a separate attraction.' },
];

export const TIERS = [
  { id: 'general', name: 'General Admission', price: '$31', note: 'Entry at midnight. Exit negotiable.' },
  { id: 'front', name: 'Front Row', price: '$66', note: 'Close enough to smell the greasepaint.' },
  { id: 'last', name: 'The Last Ride', price: '$666', note: 'Private gondola. One way.' },
] as const;
export const GOLDEN_TIER = { id: 'golden', name: 'The Golden Ticket', price: 'Free', note: 'Thirteen balloons. Thirteen souls. You may keep yours.' } as const;
export const POPS_FOR_GOLDEN = 13;

export const PALETTE = {
  fog: new THREE.Color('#150b1c'),
  bulb: new THREE.Color(1.0, 0.62, 0.26),
};
