import * as THREE from 'three';
import { useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { LAYOUT, T } from '../config';
import { ride } from '../state/ride';
import { useBulbs, useTextures } from '../three/assets';
import { U, createGlows, cutoutMaterial, electric, stackedCutout } from '../three/materials';
import { damp, smoothstep } from '../lib/utils';

const GATE_W = 16, GATE_H = 24;
const px = (u: number, v: number, w = GATE_W, h = GATE_H) => new THREE.Vector2((u - 0.5) * w, (0.5 - v) * h);

/* A sphere, not a sprite: the painted iris wraps the front hemisphere; pupils dilate; the iris smoulders. */
function eyeMaterial(tex: THREE.Texture) {
  return new THREE.ShaderMaterial({
    uniforms: { map: { value: tex }, uDilate: { value: 0 }, uGlow: { value: 1 }, uPower: U.uPower, uLightning: U.uLightning },
    vertexShader: /* glsl */`
      varying vec3 vP; varying vec3 vN; varying vec3 vV;
      void main() {
        vP = normalize(position);
        vN = normalize(normalMatrix * normal);
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vV = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */`
      uniform sampler2D map; uniform float uDilate, uGlow, uPower, uLightning;
      varying vec3 vP; varying vec3 vN; varying vec3 vV;
      void main() {
        vec2 c = vP.xy * 0.49;
        float r = length(c);
        const float IRIS = 0.3;
        if (r < IRIS) c *= pow(r / IRIS, uDilate * 0.9);
        vec3 col = texture2D(map, c + 0.5).rgb;
        if (vP.z < 0.0) col = vec3(0.55, 0.45, 0.4);
        float diff = 0.45 + 0.55 * max(dot(vN, normalize(vec3(-0.3, 0.5, 0.8))), 0.0);
        float spec = pow(max(dot(reflect(-normalize(vec3(-0.4, 0.6, 0.7)), vN), vV), 0.0), 60.0);
        float iris = smoothstep(IRIS, IRIS - 0.04, r) * step(0.0, vP.z);
        col = col * diff + spec * (0.8 + uLightning * 2.0);
        // in the dark, the eyes are the last thing still lit
        col += col * iris * uGlow * (1.4 + uDilate * 2.2) * max(uPower, 0.6);
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
}

export function Gate() {
  const tx = useTextures('gate_clown_face', 'clown_eyeball', 'logo_hollowgrin_lit', 'logo_hollowgrin_unlit');
  const bulbs = useBulbs();

  const built = useMemo(() => {
    const group = new THREE.Group();
    group.position.copy(LAYOUT.gate);
    const slab = stackedCutout(tx.gate_clown_face, GATE_W, GATE_H, { layers: 7, depth: 0.5, tint: new THREE.Color(0.95, 0.9, 0.9), edge: 0x1c0d0a });
    slab.position.y = GATE_H / 2;
    group.add(slab);

    const eyeGeo = new THREE.SphereGeometry(0.68, 48, 32);
    const eyes = [[439, 489], [591, 475]].map(([x, y]) => {
      const p = px(x / 1024, y / 1536);
      const m = new THREE.Mesh(eyeGeo, eyeMaterial(tx.clown_eyeball));
      m.position.set(p.x, p.y + GATE_H / 2, -1.05);
      group.add(m);
      const back = new THREE.Mesh(new THREE.CircleGeometry(1.3, 24), new THREE.MeshBasicMaterial({ color: 0x050203 }));
      back.position.set(p.x, p.y + GATE_H / 2, -1.9);
      group.add(back);
      return m;
    });

    group.add(createGlows((bulbs.gate_clown_face || []).map(([u, v, r]) => {
      const p = px(u, v);
      return { p: new THREE.Vector3(p.x, p.y + GATE_H / 2, 0.06), s: Math.max(r * GATE_W * 7, 0.9) };
    }), { intensity: 1.6 }));

    const warm = electric(new THREE.PointLight(0xff9a4a, 90, 45, 1.6));
    warm.position.set(0, 7, 7);
    const inside = electric(new THREE.PointLight(0xff5530, 40, 26, 1.6));
    inside.position.set(0, 5, -6);
    group.add(warm, inside);

    /* the marquee, hanging on chains in front of the gate */
    const LOGO_W = 11.2, LOGO_H = LOGO_W / 1.5;
    const pivot = new THREE.Group();
    pivot.position.set(0, 6.1 + LOGO_H / 2, 15);
    const logo = new THREE.Group();
    logo.position.y = -LOGO_H / 2;
    pivot.add(logo);
    group.add(pivot);
    logo.add(stackedCutout(tx.logo_hollowgrin_unlit, LOGO_W, LOGO_H, { layers: 5, depth: 0.22, tint: new THREE.Color(0.7, 0.66, 0.75) }));
    const litMat = cutoutMaterial(tx.logo_hollowgrin_lit, { transparent: true, alphaTest: 0.01, tint: new THREE.Color(1.12, 1.05, 1.0), floor: 0.9 });
    const lit = new THREE.Mesh(new THREE.PlaneGeometry(LOGO_W, LOGO_H), litMat);
    lit.position.z = 0.012;
    lit.renderOrder = 3;
    logo.add(lit);
    const logoGlows = createGlows((bulbs.logo_hollowgrin_lit || []).map(([u, v, r]) => {
      const p = px(u, v, LOGO_W, LOGO_H);
      return { p: new THREE.Vector3(p.x, p.y, 0.05), s: Math.max(r * LOGO_W * 6.5, 0.45) };
    }), { intensity: 1.5, flicker: 0.4 });
    logo.add(logoGlows);
    const chainMat = new THREE.MeshStandardMaterial({ color: 0x2a2320, metalness: 0.8, roughness: 0.5 });
    for (const u of [0.135, 0.857]) {
      const chain = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 40, 6), chainMat);
      chain.position.set((u - 0.5) * LOGO_W, LOGO_H / 2 + 20 - 0.1, -0.02);
      logo.add(chain);
    }
    const logoLight = new THREE.PointLight(0xffa860, 30, 16, 1.8);
    logoLight.position.set(0, 0, 3);
    logo.add(logoLight);

    return { group, eyes, pivot, litMat, logoGlows, logoLight, LOGO_H };
  }, [tx, bulbs]);

  const tmp = useMemo(() => ({
    target: new THREE.Vector3(), q: new THREE.Quaternion(), m4: new THREE.Matrix4(), eyeW: new THREE.Vector3(),
    up: new THREE.Vector3(0, 1, 0), proj: new THREE.Vector3(), saccade: new THREE.Vector3(),
    nextSaccade: 0, dilate: 0, lit: 1, spark: 0,
  }), []);

  useFrame(({ camera }) => {
    const { group, eyes, pivot, litMat, logoGlows, logoLight, LOGO_H } = built;
    const t = ride.t, dt = ride.dt, time = ride.time;
    group.visible = t < 0.36 || t > T.panorama;
    if (t >= 0.36) return;

    // hovering near the eyes makes the pupils blow wide
    let hover = false;
    if (t < 0.1) for (const e of eyes) {
      e.getWorldPosition(tmp.proj).project(camera);
      if (Math.hypot((tmp.proj.x - ride.pointer.x) * (camera as THREE.PerspectiveCamera).aspect, tmp.proj.y - ride.pointer.y) < 0.12) hover = true;
    }
    if (time > tmp.nextSaccade) {
      tmp.saccade.set((Math.random() - 0.5) * 2.5, (Math.random() - 0.5) * 1.5, 0);
      tmp.nextSaccade = time + 0.4 + Math.random() * 2.2;
    }
    tmp.target.copy(ride.pointerRay.origin).addScaledVector(ride.pointerRay.direction, 7).add(tmp.saccade);
    if (t > 0.2) tmp.target.copy(camera.position);
    for (const eye of eyes) {
      eye.getWorldPosition(tmp.eyeW);
      tmp.m4.lookAt(tmp.target, tmp.eyeW, tmp.up);
      tmp.q.setFromRotationMatrix(tmp.m4);
      eye.quaternion.slerp(tmp.q, 1 - Math.exp(-dt * 10));
    }
    tmp.dilate = damp(tmp.dilate, hover ? 1 : 0.15 + 0.1 * Math.sin(time * 0.7), 4, dt);
    for (const eye of eyes) (eye.material as THREE.ShaderMaterial).uniforms.uDilate.value = tmp.dilate;

    // marquee sputters with the grid, plus its own shorts
    tmp.spark -= dt;
    let want = U.uPower.value;
    if (tmp.spark < 0 && Math.random() < dt * 0.25) tmp.spark = 0.35;
    if (tmp.spark > 0) want *= Math.random() > 0.5 ? 0.15 : 1;
    tmp.lit = damp(tmp.lit, want, 30, dt);
    litMat.uniforms.uOpacity.value = tmp.lit;
    (logoGlows.material as THREE.ShaderMaterial).uniforms.uLocal.value = tmp.lit;
    logoLight.intensity = 30 * tmp.lit;

    const h = smoothstep(T.logoHoist[0], T.logoHoist[1], t);
    pivot.position.y = 6.1 + LOGO_H / 2 + h * h * 26;
    pivot.rotation.z = Math.sin(time * 0.6) * 0.025 + Math.sin(time * 2.3) * 0.006 * (1 + h * 8);
    pivot.rotation.x = -h * 0.35 + Math.sin(time * 0.45) * 0.015;
    pivot.visible = h < 0.999;
  });

  return <primitive object={built.group} />;
}
