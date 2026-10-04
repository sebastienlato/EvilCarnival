import * as THREE from 'three';
import { useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { LAYOUT, T } from '../config';
import { ride } from '../state/ride';
import { useTextures, variant } from '../three/assets';
import { createBulbs, electric, stackedCutout } from '../three/materials';
import { damp } from '../lib/utils';

export function Carousel() {
  const tx = useTextures('tex_rusted_metal', 'tex_carousel_canopy', 'tex_tent_stripes', 'carousel_horse_skeleton', 'carousel_goat', 'carousel_serpent');

  const built = useMemo(() => {
    const root = new THREE.Group();
    root.position.copy(LAYOUT.carousel);
    const spin = new THREE.Group();
    root.add(spin);
    const R = 9.5;
    const brass = new THREE.MeshStandardMaterial({ color: 0xc89b4a, metalness: 0.9, roughness: 0.28, emissive: 0x2a1500 });
    const metal = new THREE.MeshStandardMaterial({ map: variant(tx.tex_rusted_metal, 8, 1, THREE.MirroredRepeatWrapping), roughness: 0.7, metalness: 0.4 });
    const deck = new THREE.MeshStandardMaterial({ color: 0x3b2418, roughness: 0.85 });

    const platform = new THREE.Mesh(new THREE.CylinderGeometry(R, R + 0.2, 0.8, 64), [metal, deck, deck]);
    platform.position.y = 0.4;
    spin.add(platform);
    for (let i = 1; i < 5; i++) {
      const ring = new THREE.Mesh(new THREE.RingGeometry(i * 1.9 - 0.03, i * 1.9 + 0.03, 64), new THREE.MeshBasicMaterial({ color: 0x120804 }));
      ring.rotation.x = -Math.PI / 2; ring.position.y = 0.81;
      spin.add(ring);
    }
    const colTex = variant(tx.tex_carousel_canopy, 2, 1);
    const column = new THREE.Mesh(new THREE.CylinderGeometry(2.1, 2.1, 5.8, 48, 1, true), new THREE.MeshStandardMaterial({ map: colTex, roughness: 0.55, metalness: 0.2, emissive: 0xffffff, emissiveMap: colTex, emissiveIntensity: 0.35 }));
    column.position.y = 3.7;
    const bandTex = variant(tx.tex_carousel_canopy, 5, 1);
    const band = new THREE.Mesh(new THREE.CylinderGeometry(R + 0.4, R + 0.4, 2.8, 96, 1, true), new THREE.MeshStandardMaterial({ map: bandTex, side: THREE.DoubleSide, roughness: 0.6, emissive: 0xffffff, emissiveMap: bandTex, emissiveIntensity: 0.55 }));
    band.position.y = 8.1;
    const roofTex = variant(tx.tex_tent_stripes, 4, 1);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(R + 1.1, 4.8, 64, 1, true), new THREE.MeshStandardMaterial({ map: roofTex, side: THREE.DoubleSide, roughness: 0.9, emissive: 0xffffff, emissiveMap: roofTex, emissiveIntensity: 0.12 }));
    roof.position.y = 11.9;
    const finial = new THREE.Mesh(new THREE.SphereGeometry(0.55, 16, 12), brass);
    finial.position.y = 14.5;
    const spike = new THREE.Mesh(new THREE.ConeGeometry(0.22, 1.6, 12), brass);
    spike.position.y = 15.6;
    spin.add(column, band, roof, finial, spike);

    const pts: THREE.Vector3[] = [], ph: number[] = [];
    for (let i = 0; i < 72; i++) {
      const a = (i / 72) * Math.PI * 2;
      pts.push(new THREE.Vector3(Math.cos(a) * (R + 0.55), 6.75, Math.sin(a) * (R + 0.55))); ph.push(i);
      pts.push(new THREE.Vector3(Math.cos(a) * (R + 0.55), 9.45, Math.sin(a) * (R + 0.55))); ph.push(i + 2);
    }
    for (let r = 0; r < 16; r++) {
      const a = (r / 16) * Math.PI * 2;
      for (let k = 1; k < 9; k++) {
        const f = k / 9;
        pts.push(new THREE.Vector3(Math.cos(a) * (R + 1.1) * (1 - f), 9.55 + f * 4.8, Math.sin(a) * (R + 1.1) * (1 - f))); ph.push(k * 2);
      }
    }
    spin.add(createBulbs(pts, { radius: 0.1, intensity: 4.6, chase: 0.7, chaseSpeed: 1, phases: ph }));

    const mounts: { mount: THREE.Object3D; phase: number; base: number }[] = [];
    const kinds = [tx.carousel_horse_skeleton, tx.carousel_goat, tx.carousel_serpent];
    const poleGeo = new THREE.CylinderGeometry(0.08, 0.08, 6.0, 10);
    let idx = 0;
    for (const ring of [{ r: 7.3, n: 12, size: 3.5 }, { r: 4.5, n: 6, size: 2.9 }]) {
      for (let i = 0; i < ring.n; i++) {
        const holder = new THREE.Group();
        holder.rotation.y = (i / ring.n) * Math.PI * 2 + (ring.r < 6 ? 0.26 : 0);
        spin.add(holder);
        const pole = new THREE.Mesh(poleGeo, brass);
        pole.position.set(ring.r, 3.8, 0);
        holder.add(pole);
        const mount = stackedCutout(kinds[idx++ % 3], ring.size, ring.size, { layers: 3, depth: 0.12, tint: new THREE.Color(1.0, 0.92, 0.86), edge: 0x2a1408 });
        const rocker = new THREE.Group(); // pitches the mount so it gallops, not just bobs
        rocker.rotation.y = Math.PI / 2; // face outward; image-right = direction of travel
        rocker.position.set(ring.r, 3.0, 0);
        rocker.add(mount);
        holder.add(rocker);
        mounts.push({ mount: rocker, phase: i * 1.3 + ring.r, base: 3.0 });
      }
    }
    const light = electric(new THREE.PointLight(0xffa050, 160, 34, 1.5));
    light.position.set(0, 6.2, 0);
    const under = electric(new THREE.PointLight(0xff4a2a, 40, 18, 1.6));
    under.position.set(0, 1.6, 0);
    root.add(light, under);
    return { root, spin, mounts };
  }, [tx]);

  const s = useMemo(() => ({ omega: 0.35 }), []);
  useFrame(() => {
    const t = ride.t, dt = ride.dt, time = ride.time;
    built.root.visible = (t > 0.07 && t < 0.62) || t > T.panorama;
    if (!built.root.visible) return;
    s.omega = damp(s.omega, 0.28 + Math.min(Math.abs(ride.vel) * 9, 2.4), 1.4, dt);
    built.spin.rotation.y += s.omega * dt;
    for (const m of built.mounts) {
      const ph = time * 1.7 * (0.6 + s.omega) + m.phase;
      m.mount.position.y = m.base + Math.sin(ph) * 0.55;
      m.mount.rotation.z = Math.cos(ph) * 0.09;
    }
  });
  return <primitive object={built.root} />;
}
