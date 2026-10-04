import * as THREE from 'three';
import { useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { LAYOUT } from '../config';
import { ride } from '../state/ride';
import { useTextures, variant } from '../three/assets';
import { createBulbs, createGlows, electric } from '../three/materials';
import { N_GONDOLAS, pivotOf, wheelAngle } from './ferrisMath';

export function Ferris() {
  const tx = useTextures('tex_rusted_metal', 'tex_carousel_canopy', 'tex_tent_stripes');
  const b = useMemo(() => {
    const W = LAYOUT.wheel, R = LAYOUT.wheelRadius, Z = 1.9;
    const root = new THREE.Group();
    root.position.copy(W);
    const wheel = new THREE.Group();
    root.add(wheel);
    const iron = new THREE.MeshStandardMaterial({ map: variant(tx.tex_rusted_metal, 20, 1, THREE.MirroredRepeatWrapping), color: 0xb05050, roughness: 0.6, metalness: 0.45 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x2a1614, roughness: 0.7, metalness: 0.5 });
    for (const z of [-Z, Z]) {
      const rim = new THREE.Mesh(new THREE.TorusGeometry(R, 0.24, 8, 180), iron); rim.position.z = z;
      const inner = new THREE.Mesh(new THREE.TorusGeometry(R * 0.46, 0.16, 8, 96), iron); inner.position.z = z;
      wheel.add(rim, inner);
    }
    const spokes = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.09, 0.09, 1, 6), dark, N_GONDOLAS * 5);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), Y = new THREE.Vector3(0, 1, 0);
    let n = 0;
    for (let i = 0; i < N_GONDOLAS; i++) {
      const a = (i / N_GONDOLAS) * Math.PI * 2;
      const dir = new THREE.Vector3(Math.cos(a), Math.sin(a), 0);
      for (const z of [-Z, Z]) {
        q.setFromUnitVectors(Y, dir);
        spokes.setMatrixAt(n++, m4.compose(p.copy(dir).multiplyScalar((R + 1.4) / 2).setZ(z), q, s.set(1, R - 1.4, 1)));
        const a2 = a + Math.PI / N_GONDOLAS;
        const from = new THREE.Vector3(Math.cos(a) * R * 0.46, Math.sin(a) * R * 0.46, z);
        const to = new THREE.Vector3(Math.cos(a2) * R, Math.sin(a2) * R, z);
        const d = to.clone().sub(from);
        q.setFromUnitVectors(Y, d.clone().normalize());
        spokes.setMatrixAt(n++, m4.compose(p.copy(from).add(to).multiplyScalar(0.5), q, s.set(0.7, d.length(), 0.7)));
      }
      q.setFromUnitVectors(Y, new THREE.Vector3(0, 0, 1));
      spokes.setMatrixAt(n++, m4.compose(p.copy(dir).multiplyScalar(R), q, s.set(1.3, Z * 2, 1.3)));
    }
    wheel.add(spokes);
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(1.7, 1.7, Z * 2 + 0.6, 32), iron);
    hub.rotation.x = Math.PI / 2;
    const emblem = new THREE.Mesh(new THREE.CircleGeometry(1.6, 48), new THREE.MeshBasicMaterial({ map: variant(tx.tex_carousel_canopy, 0.2, 0.42, THREE.ClampToEdgeWrapping, [0.4, 0.34]), color: 0xd8c0b0 }));
    emblem.position.z = Z + 0.32;
    wheel.add(hub, emblem);

    const pts: THREE.Vector3[] = [], ph: number[] = [];
    for (const z of [-Z - 0.2, Z + 0.2]) for (let i = 0; i < 144; i++) { const a = (i / 144) * Math.PI * 2; pts.push(new THREE.Vector3(Math.cos(a) * R, Math.sin(a) * R, z)); ph.push(i); }
    for (let i = 0; i < N_GONDOLAS; i++) {
      const a = (i / N_GONDOLAS) * Math.PI * 2;
      for (let k = 1; k <= 9; k++) { const r = 1.8 + (k / 9) * (R - 2); pts.push(new THREE.Vector3(Math.cos(a) * r, Math.sin(a) * r, Z + 0.2)); ph.push(10 - k); }
    }
    wheel.add(createBulbs(pts, { radius: 0.16, intensity: 7, chase: 0.85, chaseSpeed: 1, phases: ph }));

    const legGeo = new THREE.CylinderGeometry(0.3, 0.45, 1, 10);
    for (const [lx, lz] of [[-10, -6], [10, -6], [-10, 6], [10, 6]]) {
      const from = new THREE.Vector3(lx, -W.y, lz), to = new THREE.Vector3(0, 0, Math.sign(lz) * (Z + 0.7));
      const d = to.clone().sub(from);
      const leg = new THREE.Mesh(legGeo, dark);
      leg.scale.set(1, d.length(), 1);
      leg.quaternion.setFromUnitVectors(Y, d.clone().normalize());
      leg.position.copy(from).add(to).multiplyScalar(0.5);
      root.add(leg);
    }
    const axle = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, Z * 2 + 3, 12), dark);
    axle.rotation.x = Math.PI / 2;
    root.add(axle);

    const stripes = variant(tx.tex_tent_stripes, 2, 1);
    const roofMat = new THREE.MeshStandardMaterial({ map: stripes, roughness: 0.8, emissive: 0xffffff, emissiveMap: stripes, emissiveIntensity: 0.12 });
    const BARS = 14;
    const floors = new THREE.InstancedMesh(new THREE.CylinderGeometry(1.25, 1.1, 0.35, 20), iron, N_GONDOLAS);
    const roofs = new THREE.InstancedMesh(new THREE.ConeGeometry(1.55, 1.0, 20, 1, true), roofMat, N_GONDOLAS);
    const hangers = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.07, 0.07, 1.1, 6), dark, N_GONDOLAS);
    const bars = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.035, 0.035, 2.1, 5), dark, N_GONDOLAS * BARS);
    for (const im of [floors, roofs, hangers, bars]) { im.frustumCulled = false; root.add(im); }
    const roofGlows = createGlows(Array.from({ length: N_GONDOLAS }, () => ({ p: new THREE.Vector3(), s: 1.1 })), { intensity: 1.2 });
    root.add(roofGlows);
    const light = electric(new THREE.PointLight(0xff7a40, 200, 60, 1.3));
    light.position.set(0, 0, 8);
    root.add(light);
    return { root, wheel, floors, roofs, hangers, bars, BARS, glowPos: roofGlows.geometry.attributes.aPos as THREE.InstancedBufferAttribute };
  }, [tx]);

  const tmp = useMemo(() => ({ m4: new THREE.Matrix4(), q: new THREE.Quaternion(), one: new THREE.Vector3(1, 1, 1), base: new THREE.Vector3(), v: new THREE.Vector3(), Zaxis: new THREE.Vector3(0, 0, 1) }), []);
  useFrame(() => {
    const t = ride.t, time = ride.time;
    b.root.visible = t > 0.6;
    if (!b.root.visible) return;
    const angle = wheelAngle(t);
    b.wheel.rotation.z = angle;
    const { m4, q, one, base, v, Zaxis } = tmp;
    const down = (d: number) => v.set(0, -d, 0).applyQuaternion(q).add(base);
    for (let i = 0; i < N_GONDOLAS; i++) {
      pivotOf(i, angle, base);
      q.setFromAxisAngle(Zaxis, Math.sin(time * 0.9 + i) * 0.035);
      b.hangers.setMatrixAt(i, m4.compose(down(0.55), q, one));
      b.roofs.setMatrixAt(i, m4.compose(down(1.3), q, one));
      b.floors.setMatrixAt(i, m4.compose(down(3.75), q, one));
      for (let k = 0; k < b.BARS; k++) {
        const ba = (k / b.BARS) * Math.PI * 2;
        b.bars.setMatrixAt(i * b.BARS + k, m4.compose(v.set(Math.cos(ba) * 1.12, -2.7, Math.sin(ba) * 1.12).applyQuaternion(q).add(base), q, one));
      }
      const g = down(0.7);
      b.glowPos.setXYZ(i, g.x, g.y, g.z);
    }
    for (const im of [b.floors, b.roofs, b.hangers, b.bars]) im.instanceMatrix.needsUpdate = true;
    b.glowPos.needsUpdate = true;
  });
  return <primitive object={b.root} />;
}
