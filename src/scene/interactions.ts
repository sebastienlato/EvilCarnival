import * as THREE from 'three';

/*
 * Click/hover targets for imperatively-built objects (things re-parented to the
 * camera, instanced systems…). One raycast per event; the nearest enabled hit wins.
 */
export interface Interactable {
  object: THREE.Object3D;
  enabled: () => boolean;
  onClick: (hit: THREE.Intersection) => void;
  cursor?: 'point' | 'grab';
}

const list = new Set<Interactable>();
export function register(i: Interactable) {
  list.add(i);
  return () => { list.delete(i); };
}

const raycaster = new THREE.Raycaster();
export function pick(ndc: THREE.Vector2, camera: THREE.Camera) {
  raycaster.setFromCamera(ndc, camera);
  let best: { it: Interactable; hit: THREE.Intersection } | null = null;
  for (const it of list) {
    if (!it.enabled() || !isShown(it.object)) continue;
    const hits = raycaster.intersectObject(it.object, true);
    if (hits.length && (!best || hits[0].distance < best.hit.distance)) best = { it, hit: hits[0] };
  }
  return best;
}

function isShown(o: THREE.Object3D | null): boolean {
  while (o) { if (!o.visible) return false; o = o.parent; }
  return true;
}
