import * as THREE from 'three';
import { Suspense, memo, useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { T } from '../config';
import { ride, useUI } from '../state/ride';
import { Director } from './Director';
import { PostFX } from './PostFX';
import { Environment } from './Environment';
import { Gate } from './Gate';
import { BulbMarquee } from './BulbMarquee';
import { Midway, Walkways } from './Midway';
import { Carousel } from './Carousel';
import { Mirrors } from './Mirrors';
import { Fortune } from './Fortune';
import { Banners } from './Banners';
import { BigTop } from './BigTop';
import { Ferris } from './Ferris';
import { Balloons, Debris, balloonsApi } from './Particles';
import { Fireworks } from './Fireworks';
import { Flashlight } from './Flashlight';
import { Ticket } from './Ticket';
import { pick } from './interactions';
import { LightRig } from './LightRig';
import { isTouch } from '../lib/utils';

const touch = isTouch();

/**
 * Compiles every shader the ride will need, then tells the DOM the gates are open.
 * `compile` visits hidden objects too, and LightRig keeps the light count fixed, so
 * nothing is left to compile mid-ride.
 */
function Ready() {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);
  useEffect(() => {
    let cancelled = false;
    useUI.getState().set({ loadLabel: 'Summoning clowns' });
    // programs are keyed by output colour space, and the world is only ever drawn into
    // linear render targets (composer, mirrors, wet floor), never straight to the screen
    const target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType });
    const prev = gl.getRenderTarget();
    gl.setRenderTarget(target);
    const compiled = gl.compileAsync(scene, camera);
    gl.setRenderTarget(prev);
    compiled.catch(() => {}).finally(() => {
      target.dispose();
      if (!cancelled) useUI.getState().set({ phase: 'ready', progress: 1, loadLabel: 'The gates are open' });
    });
    return () => { cancelled = true; };
  }, [gl, scene, camera]);
  return null;
}

/** One raycast per click; the nearest registered object wins, else try popping a balloon. */
function Interactions() {
  const gl = useThree((s) => s.gl);
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  useEffect(() => {
    const ndc = new THREE.Vector2();
    const onClick = (e: MouseEvent) => {
      if (!ride.entered) return;
      ndc.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
      const hit = pick(ndc, camera);
      if (hit) { hit.it.onClick(hit.hit); return; }
      balloonsApi.pop(ndc, camera);
    };
    gl.domElement.addEventListener('click', onClick);
    return () => gl.domElement.removeEventListener('click', onClick);
  }, [gl, camera]);

  // hovering something clickable swells the glove cursor (no hover, no glove on touch screens)
  useFrame(() => {
    if (!ride.entered || !ride.pointerActive || touch) return;
    const over = !!pick(ride.pointer, camera);
    document.body.classList.toggle('is-hover3d', over);
  });
  return null;
}

/** Memoised: App re-renders when PerformanceMonitor changes the pixel ratio, and the world needn't. */
export const Experience = memo(function Experience() {
  return (
    <>
      <Director />
      <PostFX />
      <Suspense fallback={null}>
        <Ticket />
      </Suspense>
      <Suspense fallback={null}>
        <Environment />
        <Gate />
        <BulbMarquee text="WELCOME HOME" position={[0, 9.4, -17]} width={17} reveal={[T.marquee[0], T.marquee[1]]} visible={[0.0, 0.2]} />
        <Midway />
        <Walkways />
        <Carousel />
        <Mirrors />
        <Fortune />
        <Banners />
        <BigTop />
        <Ferris />
        <Balloons />
        <Debris />
        <Fireworks />
        <Flashlight />
        <LightRig />
        <Ready />
      </Suspense>
      <Interactions />
    </>
  );
});
