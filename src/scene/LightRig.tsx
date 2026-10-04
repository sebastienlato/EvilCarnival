import * as THREE from 'three';
import { useLayoutEffect, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';

/** A layer no camera (main, mirror or floor reflector) ever renders. */
const ANCHOR_LAYER = 31;

type StageLight = THREE.PointLight | THREE.SpotLight;
const isStageLight = (o: THREE.Object3D): o is StageLight => (o as THREE.PointLight).isPointLight || (o as THREE.SpotLight).isSpotLight;
const isSpot = (l: StageLight): l is THREE.SpotLight => (l as THREE.SpotLight).isSpotLight;

/** Visible all the way up to the scene (a light that has left the scene is off). */
function shownIn(scene: THREE.Object3D, o: THREE.Object3D) {
  for (let p: THREE.Object3D | null = o; p; p = p.parent) {
    if (!p.visible) return false;
    if (p === scene) return true;
  }
  return false;
}

/**
 * Keeps the renderer's light count constant for the whole ride.
 *
 * Standard materials need a separate shader program for every light count, and
 * set pieces hide their groups (lights included) as you pass, so each chapter
 * change used to compile a burst of programs mid-scroll. Instead, every light
 * built into a set piece becomes an anchor on a layer the renderer ignores,
 * and a twin at the scene root copies its pose and settings each frame, going
 * dark (not away) while its set piece is hidden. The lighting is identical and
 * the program set is fixed, so `Ready` can compile all of it during loading.
 *
 * Mount inside the set pieces' Suspense boundary, after them: it collects the
 * lights they have attached by the time it commits.
 */
export function LightRig() {
  const scene = useThree((s) => s.scene);
  const rig = useMemo(() => new THREE.Group(), []);
  const pairs = useMemo(() => [] as { anchor: StageLight; twin: StageLight }[], []);

  useLayoutEffect(() => {
    const anchors: StageLight[] = [];
    scene.traverse((o) => {
      if (isStageLight(o) && o.parent !== scene && o.parent !== rig) anchors.push(o);
    });
    for (const anchor of anchors) {
      const twin = anchor.clone(false);
      if (isSpot(twin)) rig.add(twin.target);
      anchor.layers.set(ANCHOR_LAYER);
      rig.add(twin);
      pairs.push({ anchor, twin });
    }
    scene.add(rig);
    return () => {
      scene.remove(rig);
      for (const { anchor } of pairs) anchor.layers.set(0);
      rig.clear();
      pairs.length = 0;
    };
  }, [scene, rig, pairs]);

  // after every set piece has set its visibility and light levels, before PostFX renders
  useFrame(() => {
    for (const { anchor, twin } of pairs) {
      const on = shownIn(scene, anchor);
      twin.intensity = on ? anchor.intensity : 0;
      if (!on) continue;
      anchor.getWorldPosition(twin.position);
      twin.color.copy(anchor.color);
      if (isSpot(anchor) && isSpot(twin)) {
        anchor.target.getWorldPosition(twin.target.position);
        twin.angle = anchor.angle;
        twin.penumbra = anchor.penumbra;
      }
    }
  }, 0.5);

  return null;
}
