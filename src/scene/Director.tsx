import * as THREE from 'three';
import { useEffect, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { CAMERA_KEYS, T, TOP_LOOK } from '../config';
import { ride, bridge, useUI } from '../state/ride';
import { audio } from '../lib/audio';
import { U, electricLights } from '../three/materials';
import { clamp, damp, lerp, smoothstep, tween, ease, updateTweens, window01 } from '../lib/utils';
import { scroll } from '../lib/ticker';
import { ridePose } from './ferrisMath';

/** Lightning strikes are announced here; the sky listens. */
export const lightningBus = { strike: (_x: number) => {} };

const keyTs = CAMERA_KEYS.map((k) => k[0]);

/**
 * The per-frame brain: scroll → ride progress, camera choreography, the power
 * grid, lightning, the beat clock, scares. Runs before everything else.
 */
export function Director() {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const scene = useThree((s) => s.scene);

  const rigs = useMemo(() => {
    const mk = (pi: number, li: number) => ({
      pos: new THREE.CatmullRomCurve3(CAMERA_KEYS.map((k) => (k[pi] ?? k[1]) as THREE.Vector3), false, 'centripetal'),
      look: new THREE.CatmullRomCurve3(CAMERA_KEYS.map((k) => (k[li] ?? k[2]) as THREE.Vector3), false, 'centripetal'),
    });
    return { wide: mk(1, 2), tall: mk(3, 4) };
  }, []);

  const tmp = useMemo(() => ({
    camTarget: new THREE.Vector3(), lookTarget: new THREE.Vector3(), right: new THREE.Vector3(),
    helper: new THREE.PerspectiveCamera(), raycaster: new THREE.Raycaster(),
    boardLook: CAMERA_KEYS[CAMERA_KEYS.length - 1][2].clone(),
  }), []);

  const state = useMemo(() => ({
    brownout: 0, nextBrownout: 10, nextLightning: 7, strikes: [] as number[],
    scareArmed: true, blackoutArmed: true, pointerSmooth: new THREE.Vector2(), started: false,
  }), []);

  const gl = useThree((s) => s.gl);
  const size = useThree((s) => s.size);
  // portrait screens get a wider lens so the set pieces still fit
  useEffect(() => {
    const aspect = size.width / Math.max(size.height, 1);
    camera.fov = aspect >= 1 ? 45 : lerp(45, 66, clamp((1 - aspect) / 0.55));
    camera.updateProjectionMatrix();
  }, [size, camera]);

  useEffect(() => {
    if (new URLSearchParams(location.search).has('debug')) (window as unknown as Record<string, unknown>).__ec = { ride, scene, camera, gl, useUI, U, audio };
  }, [scene, camera, gl]);

  // camera carries the ticket and the tarot card, so it must live in the scene graph
  useEffect(() => {
    scene.add(camera);
    camera.position.copy(CAMERA_KEYS[0][1]);
    camera.lookAt(CAMERA_KEYS[0][2]);
    return () => { scene.remove(camera); };
  }, [scene, camera]);

  useEffect(() => {
    let token = {};
    bridge.rideTo = (t: number) => {
      if (!ride.entered) return;
      const from = scrollY, to = clamp(t) * scroll.max;
      const dist = Math.abs(to - from) / scroll.max;
      const my = (token = {});
      tween({ duration: 1.2 + dist * 3.5, ease: ease.inOutCubic, onUpdate: (k) => { if (token === my) scrollTo(0, lerp(from, to, k)); } });
    };
    const cancel = () => { token = {}; };
    addEventListener('wheel', cancel, { passive: true });
    addEventListener('touchstart', cancel, { passive: true });
    const move = (e: PointerEvent) => {
      ride.pointer.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
      ride.pointerActive = true;
    };
    addEventListener('pointermove', move, { passive: true });
    addEventListener('pointerdown', move, { passive: true });
    return () => {
      removeEventListener('wheel', cancel); removeEventListener('touchstart', cancel);
      removeEventListener('pointermove', move); removeEventListener('pointerdown', move);
    };
  }, []);

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 1 / 20);
    ride.dt = dt;
    ride.time += dt;
    const time = ride.time;
    U.uTime.value = time;
    updateTweens(dt);

    /* scroll → progress */
    const prevT = ride.t;
    if (ride.entered) ride.target = clamp(scroll.y / scroll.max);
    ride.t = damp(ride.t, ride.target, ride.reducedMotion ? 6 : 3.4, dt);
    if (Math.abs(ride.t - ride.target) < 1e-5) ride.t = ride.target;
    const t = ride.t;
    ride.vel = damp(ride.vel, (t - prevT) / Math.max(dt, 1e-4), 6, dt);
    ride.narrow = camera.aspect < 0.9;

    /* power grid: random brownouts */
    if (ride.entered) {
      state.nextBrownout -= dt;
      if (state.nextBrownout < 0) { state.brownout = 0.25 + Math.random() * 0.45; state.nextBrownout = 9 + Math.random() * 12; audio.buzz(); }
    }
    let power = 1;
    if (state.brownout > 0) { state.brownout -= dt; power = Math.random() < 0.55 ? 0.08 + Math.random() * 0.2 : 0.9; }
    ride.power = damp(ride.power, power, 40, dt);

    /* the Big Top's house lights die: you get a flashlight */
    const dark = window01(t, T.blackout[0] + 0.006, T.blackout[1] - 0.006, 0.006);
    if (dark > 0.5 && state.blackoutArmed) { state.blackoutArmed = false; audio.powerDown(); useUI.getState().set({ darkHint: true }); }
    if (dark < 0.05 && !state.blackoutArmed && (t < T.blackout[0] - 0.01 || t > T.blackout[1] + 0.01)) { state.blackoutArmed = true; useUI.getState().set({ darkHint: false }); }
    ride.darkness = damp(ride.darkness, dark, 8, dt);

    /* lightning, while you're outdoors and before the finale */
    const outdoors = t < 0.73 || t > 0.845;
    if (ride.entered && outdoors) {
      state.nextLightning -= dt;
      if (state.nextLightning < 0) {
        state.nextLightning = 13 + Math.random() * 14;
        const n = 2 + ((Math.random() * 2) | 0);
        state.strikes = Array.from({ length: n }, (_, i) => time + i * (0.09 + Math.random() * 0.12));
        lightningBus.strike(Math.random());
        audio.thunder(Math.random());
      }
    }
    let flash = 0;
    for (const s of state.strikes) { const d = time - s; if (d >= 0 && d < 0.35) flash = Math.max(flash, Math.exp(-d * 14) * (0.7 + Math.random() * 0.3)); }
    ride.lightning = flash;

    /* beat clock */
    const pulse = audio.beatPulse();
    if (pulse >= 0) { ride.beat = pulse; U.uChase.value = audio.beatCount; }
    else { ride.beat = 0.5 + 0.5 * Math.sin(time * 4.6); U.uChase.value = time * 2.3; }

    /* shared uniforms */
    const bulbPower = ride.power * (1 - ride.darkness * 0.97);
    U.uPower.value = bulbPower;
    U.uLight.value = ride.power * (1 - ride.darkness * 0.985);
    U.uLightning.value = ride.lightning;
    U.uBeat.value = ride.beat;
    for (const e of electricLights) e.light.intensity = e.base * bulbPower;

    /* camera */
    const { camTarget, lookTarget, helper, right } = tmp;
    const dbg = (window as unknown as { __ecDebugCam?: { pos: THREE.Vector3; look: THREE.Vector3 } }).__ecDebugCam;
    if (dbg) { camTarget.copy(dbg.pos); lookTarget.copy(dbg.look); }
    else if (t < T.board) {
      const n = keyTs.length;
      let u: number;
      if (t <= keyTs[0]) u = 0;
      else if (t >= keyTs[n - 1]) u = 1;
      else {
        let i = 0;
        while (i < n - 2 && t >= keyTs[i + 1]) i++;
        u = (i + (t - keyTs[i]) / (keyTs[i + 1] - keyTs[i])) / (n - 1);
      }
      const rig = ride.narrow ? rigs.tall : rigs.wide;
      rig.pos.getPoint(u, camTarget);
      rig.look.getPoint(u, lookTarget);
    } else {
      ridePose(t, time, camTarget);
      lookTarget.lerpVectors(tmp.boardLook, TOP_LOOK, smoothstep(T.board, T.top, t));
    }
    if (!ride.reducedMotion) {
      const ps = state.pointerSmooth;
      // during the blackout the pointer drives the flashlight, not the camera
      const k = 1 - ride.darkness;
      ps.x = damp(ps.x, ride.pointer.x * k, 2.5, dt);
      ps.y = damp(ps.y, ride.pointer.y * k, 2.5, dt);
      helper.position.copy(camTarget);
      helper.lookAt(lookTarget);
      right.set(1, 0, 0).applyQuaternion(helper.quaternion);
      camTarget.addScaledVector(right, ps.x * 0.35);
      camTarget.y += ps.y * 0.2 + Math.sin(time * 0.6) * 0.06;
      lookTarget.addScaledVector(right, ps.x * 1.6);
      lookTarget.y += ps.y;
      // a nervous handheld tremor that grows in the dark
      const shake = 0.012 + ride.darkness * 0.03 + ride.glitch * 0.08;
      camTarget.x += (Math.sin(time * 13.1) + Math.sin(time * 7.3)) * shake;
      camTarget.y += (Math.sin(time * 11.7) + Math.sin(time * 5.9)) * shake;
    }
    const lambda = ride.entered ? 5 : 50;
    camera.position.x = damp(camera.position.x, camTarget.x, lambda, dt);
    camera.position.y = damp(camera.position.y, camTarget.y, lambda, dt);
    camera.position.z = damp(camera.position.z, camTarget.z, lambda, dt);
    helper.position.copy(camera.position);
    helper.lookAt(lookTarget);
    camera.quaternion.slerp(helper.quaternion, 1 - Math.exp(-lambda * dt));
    camera.updateMatrixWorld();

    tmp.raycaster.setFromCamera(ride.pointer, camera);
    ride.pointerRay.copy(tmp.raycaster.ray);

    /* the mirror scare */
    if (state.scareArmed && prevT < T.scare && t >= T.scare) {
      state.scareArmed = false;
      audio.scare();
      ride.glitch = 1; ride.red = 0.8; ride.duck = 1;
      state.brownout = 0.5;
      flashScreen('#9e0f24', 0.6, 1100);
    }
    if (t < 0.46) state.scareArmed = true;
    ride.glitch = damp(ride.glitch, 0, 2.2, dt);
    ride.red = damp(ride.red, 0, 1.6, dt);
    ride.duck = damp(ride.duck, 0, 0.8, dt);

    const burn = window01(t, T.ringmasterBurn[0], T.ringmasterBurn[1], 0.01);
    const heart = Math.max(
      smoothstep(0.43, 0.49, t) * (1 - smoothstep(0.5, 0.53, t)),
      ride.darkness * 0.9,
      smoothstep(0.79, 0.82, t) * (1 - smoothstep(0.84, 0.86, t)) * 0.7,
    );
    audio.update(ride.entered ? ride.vel : 0, dt, time, { heart, duck: Math.max(ride.duck, burn * 0.7, ride.darkness * 0.6) });
  }, -2);

  return null;
}

export function flashScreen(color = '#fff', peak = 0.9, dur = 600) {
  const el = document.getElementById('flash');
  if (!el) return;
  el.style.background = color;
  el.animate([{ opacity: peak }, { opacity: 0 }], { duration: dur, easing: 'ease-out' });
}
