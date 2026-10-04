import * as THREE from 'three';
import { useEffect, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { ride } from '../state/ride';
import { U } from '../three/materials';

/**
 * When the house lights die, the pointer becomes a flashlight. A real SpotLight
 * lights standard materials; the painted cut-outs and the eyes in the bleachers
 * read the same cone from shared uniforms.
 */
export function Flashlight() {
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);
  const { light, dir, want, grip } = useMemo(() => {
    const light = new THREE.SpotLight(0xfff1d6, 0, 48, 0.3, 0.55, 1.2);
    return { light, dir: new THREE.Vector3(0, 0, -1), want: new THREE.Vector3(), grip: new THREE.Vector3() };
  }, []);

  useEffect(() => {
    scene.add(light, light.target);
    return () => { scene.remove(light, light.target); };
  }, [scene, light]);

  useFrame(() => {
    const on = ride.darkness;
    if (on < 1e-4) {
      light.intensity = 0;
      U.uFlashOn.value = 0;
      return;
    }
    // follow the pointer; on touch screens without a pointer, sweep slowly
    if (ride.pointerActive) want.copy(ride.pointerRay.direction);
    else want.set(Math.sin(ride.time * 0.7) * 0.5, -0.1, -1).normalize().applyQuaternion(camera.quaternion);
    dir.lerp(want, 1 - Math.exp(-ride.dt * 14)).normalize();
    // a little jitter: batteries are old
    const flicker = 0.9 + 0.1 * Math.sin(ride.time * 37) * Math.sin(ride.time * 13);
    light.position.copy(camera.position).add(grip.set(0.25, -0.35, 0).applyQuaternion(camera.quaternion));
    light.target.position.copy(light.position).addScaledVector(dir, 10);
    light.intensity = on * 420 * flicker;
    U.uFlashPos.value.copy(light.position);
    U.uFlashDir.value.copy(dir);
    U.uFlashCos.value = Math.cos(light.angle * 0.95);
    U.uFlashOn.value = on * flicker;
  });

  return null;
}
