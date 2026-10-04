import * as THREE from 'three';
import { useEffect, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { ride, useUI } from '../state/ride';
import { audio } from '../lib/audio';
import { useTextures } from '../three/assets';
import { rand } from '../lib/utils';

/* Shared instanced billboards: position, size, rotation, atlas rect, tint. */
function billboards(max: number, map: THREE.Texture) {
  const base = new THREE.PlaneGeometry(1, 1);
  const geo = new THREE.InstancedBufferGeometry();
  geo.index = base.index;
  geo.setAttribute('position', base.attributes.position);
  geo.setAttribute('uv', base.attributes.uv);
  const attr = (n: number) => new THREE.InstancedBufferAttribute(new Float32Array(max * n), n).setUsage(THREE.DynamicDrawUsage);
  const a = { pos: attr(3), size: attr(2), rot: attr(1), rect: attr(4), tint: attr(4) };
  geo.setAttribute('aPos', a.pos); geo.setAttribute('aSize', a.size); geo.setAttribute('aRot', a.rot);
  geo.setAttribute('aRect', a.rect); geo.setAttribute('aTint', a.tint);
  geo.instanceCount = max;
  const mat = new THREE.ShaderMaterial({
    uniforms: { ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog), map: { value: map } },
    vertexShader: /* glsl */`
      attribute vec3 aPos; attribute vec2 aSize; attribute float aRot; attribute vec4 aRect; attribute vec4 aTint;
      varying vec2 vUv; varying vec4 vTint;
      #include <fog_pars_vertex>
      void main() {
        vUv = aRect.xy + uv * aRect.zw;
        vTint = aTint;
        vec4 mvPosition = modelViewMatrix * vec4(aPos, 1.0);
        mvPosition.xy += mat2(cos(aRot), sin(aRot), -sin(aRot), cos(aRot)) * (position.xy * aSize);
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }
    `,
    fragmentShader: /* glsl */`
      uniform sampler2D map;
      varying vec2 vUv; varying vec4 vTint;
      #include <fog_pars_fragment>
      void main() {
        vec4 t = texture2D(map, vUv);
        if (t.a < 0.35) discard;
        vec3 c = t.rgb;
        if (vTint.a > 0.5) {
          float lum = dot(c, vec3(0.3, 0.59, 0.11));
          float keep = smoothstep(0.35, 0.75, min(c.r, min(c.g, c.b)) * 1.6);
          c = mix(vTint.rgb * (0.25 + lum * 2.6), c, keep);
        }
        gl_FragColor = vec4(c, 1.0);
        #include <fog_fragment>
      }
    `,
    fog: true,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  return { mesh, a };
}

export const debrisApi = { burst: (_o: THREE.Vector3, _count?: number, _speed?: number) => {} };
export const balloonsApi = { pop: (_ndc: THREE.Vector2, _camera: THREE.PerspectiveCamera) => false };

const TINTS: [number, number, number, number][] = [[1, 1, 1, 0], [1, 1, 1, 0], [1, 1, 1, 0], [0.85, 0.62, 0.12, 1], [0.35, 0.16, 0.5, 1], [0.9, 0.86, 0.76, 1], [0.1, 0.07, 0.08, 1]];
const POP_LINES = ['Someone will want that back.', 'That one had a name.', 'You owe the clown a balloon.', 'Pop. Pop. Pop. Keep going.'];

export function Balloons() {
  const tx = useTextures('balloon_face');
  const N = ride.quality === 'high' ? 64 : 40;
  const b = useMemo(() => {
    const { mesh, a } = billboards(N, tx.balloon_face);
    const items = Array.from({ length: N }, (_, i) => {
      a.rect.setXYZW(i, 0, 0, 1, 1);
      a.tint.setXYZW(i, ...TINTS[i % TINTS.length]);
      return { p: new THREE.Vector3(), v: rand(0.5, 1.3), phase: rand(0, 100), size: rand(1.2, 1.9), alive: true, respawn: 0 };
    });
    return { mesh, a, items };
  }, [tx, N]);

  const s = useMemo(() => ({ seeded: false, centre: new THREE.Vector3(), proj: new THREE.Vector3() }), []);
  useEffect(() => {
    balloonsApi.pop = (ndc, camera) => {
      let best: (typeof b.items)[number] | null = null, bestD = Infinity;
      for (const it of b.items) {
        if (!it.alive) continue;
        s.proj.copy(it.p).add(new THREE.Vector3(0, it.size * 0.2, 0)).project(camera);
        if (s.proj.z > 1) continue;
        const dist = camera.position.distanceTo(it.p);
        const rScreen = (it.size * 0.35) / (dist * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)));
        if (Math.hypot((s.proj.x - ndc.x) * camera.aspect, s.proj.y - ndc.y) < rScreen && dist < bestD) { best = it; bestD = dist; }
      }
      if (!best) return false;
      best.alive = false;
      best.respawn = 4 + Math.random() * 4;
      audio.pop();
      debrisApi.burst(best.p.clone(), 26, 3.5);
      const ui = useUI.getState();
      ui.pop();
      const pops = useUI.getState().pops;
      if (pops === 13) audio.golden();
      else if (pops < 13 && Math.random() < 0.35) ui.toastMsg(`${POP_LINES[(Math.random() * POP_LINES.length) | 0]} (${pops}/13)`);
      return true;
    };
  }, [b, s]);

  useFrame(({ camera }) => {
    const { a, items } = b;
    const c = s.centre.copy(camera.position);
    const spawn = (it: (typeof items)[number], anywhere: boolean) => {
      it.p.set(c.x + rand(-38, 38), anywhere ? c.y + rand(-12, 30) : c.y - rand(10, 16), c.z + rand(-38, 38));
      it.alive = true;
    };
    if (!s.seeded) { items.forEach((it) => spawn(it, true)); s.seeded = true; }
    const lift = ride.t > 0.86 ? 1.6 : 1;
    items.forEach((it, i) => {
      if (!it.alive) {
        it.respawn -= ride.dt;
        if (it.respawn <= 0) spawn(it, false);
        a.size.setXY(i, 0, 0);
        return;
      }
      it.p.y += it.v * ride.dt * lift;
      it.p.x += Math.sin(ride.time * 0.3 + it.phase) * ride.dt * 0.6;
      it.p.z += Math.cos(ride.time * 0.25 + it.phase) * ride.dt * 0.4;
      if (it.p.y > c.y + 36 || Math.abs(it.p.x - c.x) > 42 || Math.abs(it.p.z - c.z) > 42) spawn(it, false);
      const near = THREE.MathUtils.smoothstep(camera.position.distanceTo(it.p), 6, 13);
      a.pos.setXYZ(i, it.p.x, it.p.y, it.p.z);
      a.size.setXY(i, it.size * near, it.size * near);
      a.rot.setX(i, Math.sin(ride.time * 0.8 + it.phase) * 0.12);
    });
    a.pos.needsUpdate = a.size.needsUpdate = a.rot.needsUpdate = true;
  });
  return <primitive object={b.mesh} />;
}

export function Debris() {
  const tx = useTextures('debris_atlas');
  const N = ride.quality === 'high' ? 220 : 120;
  const b = useMemo(() => {
    const { mesh, a } = billboards(N, tx.debris_atlas);
    const items = Array.from({ length: N }, (_, i) => {
      const cell = i % 16, cx = cell % 4, cy = 3 - Math.floor(cell / 4);
      a.rect.setXYZW(i, cx * 0.25 + 0.02, cy * 0.25 + 0.02, 0.21, 0.21);
      a.tint.setXYZW(i, 1, 1, 1, 0);
      return { p: new THREE.Vector3(), v: new THREE.Vector3(), rot: rand(0, 6), spin: rand(-3, 3), size: rand(0.16, 0.34), life: 0, burst: false, seed: rand(0, 100) };
    });
    return { mesh, a, items };
  }, [tx, N]);

  const s = useMemo(() => ({ seeded: false, wind: new THREE.Vector3() }), []);
  const place = (it: (typeof b.items)[number], c: THREE.Vector3, near: boolean) => {
    const r = near ? rand(2, 14) : rand(8, 16), ang = rand(0, Math.PI * 2);
    it.p.set(c.x + Math.cos(ang) * r, c.y + rand(-4, 5), c.z + Math.sin(ang) * r);
    it.v.set(0, 0, 0);
    it.burst = false;
  };

  useEffect(() => {
    debrisApi.burst = (origin, count = 70, speed = 6) => {
      let n = 0;
      for (const it of b.items) {
        if (n >= count) break;
        if (it.burst) continue;
        it.burst = true;
        it.life = rand(1.8, 3.2);
        it.p.copy(origin);
        it.v.set(rand(-1, 1), rand(-0.2, 1.2), rand(-1, 1)).normalize().multiplyScalar(speed * rand(0.4, 1.1));
        n++;
      }
    };
  }, [b]);

  useFrame(({ camera }) => {
    const c = camera.position, dt = ride.dt, time = ride.time;
    if (!s.seeded) { b.items.forEach((it) => place(it, c, true)); s.seeded = true; }
    s.wind.set(Math.sin(time * 0.21) * 0.8 + 0.6, Math.sin(time * 0.33) * 0.15, Math.cos(time * 0.17) * 0.6);
    b.items.forEach((it, i) => {
      if (it.burst) {
        it.v.y -= 5.5 * dt;
        it.v.multiplyScalar(1 - dt * 0.9);
        it.life -= dt;
        if (it.life <= 0) place(it, c, false);
      } else {
        it.v.lerp(s.wind, dt * 0.5);
        it.v.y += Math.sin(time * 1.3 + it.seed) * dt * 0.4;
        it.v.x += Math.sin(time * 0.7 + it.seed) * Math.abs(ride.vel) * 18 * dt;
        if (it.p.distanceTo(c) > 18) place(it, c, false);
      }
      it.p.addScaledVector(it.v, dt);
      it.rot += it.spin * dt * (1 + it.v.length() * 0.2);
      b.a.pos.setXYZ(i, it.p.x, it.p.y, it.p.z);
      b.a.size.setXY(i, it.size, it.size);
      b.a.rot.setX(i, it.rot);
    });
    b.a.pos.needsUpdate = b.a.size.needsUpdate = b.a.rot.needsUpdate = true;
  });
  return <primitive object={b.mesh} />;
}
