import * as THREE from 'three';
import { LAYOUT, T } from '../config';
import { ease, invLerp } from '../lib/utils';

export const N_GONDOLAS = 16;
export const RIDE_OFFSET = new THREE.Vector3(0, -0.6, 5.5);

/** The wheel only turns when you scroll. Gondola 0 sits at the bottom at boarding time. */
export function wheelAngle(t: number) {
  if (t < T.board) return -Math.PI / 2 + (t - T.board) * 6;
  if (t < T.top) return -Math.PI / 2 + Math.PI * ease.inOutSine(invLerp(T.board, T.top, t));
  return Math.PI / 2 + (t - T.top) * 1.2;
}

export function pivotOf(i: number, angle: number, out: THREE.Vector3) {
  const a = angle + (i / N_GONDOLAS) * Math.PI * 2;
  return out.set(Math.cos(a) * LAYOUT.wheelRadius, Math.sin(a) * LAYOUT.wheelRadius, 0);
}

/** Camera pose while riding gondola 0. */
export function ridePose(t: number, time: number, out: THREE.Vector3) {
  pivotOf(0, wheelAngle(t), out).add(LAYOUT.wheel).add(RIDE_OFFSET);
  const k = invLerp(T.board, T.top, t);
  out.x += Math.sin(time * 0.8) * 0.12 * k;
  out.y += Math.sin(time * 1.3) * 0.05 * k;
  return out;
}
