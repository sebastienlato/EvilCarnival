import * as THREE from 'three';
import { useEffect, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { bridge, ride, useUI } from '../state/ride';
import { audio } from '../lib/audio';
import { useTextures } from '../three/assets';
import { damp, ease, tween } from '../lib/utils';
import { debrisApi } from './Particles';
import { register } from './interactions';

const TW = 3.0, TH = 2.0;
const PERF = 0.853; // perforation (u) on the front face

function ticketMaterial(front: THREE.Texture, back: THREE.Texture) {
  return new THREE.ShaderMaterial({
    uniforms: { tFront: { value: front }, tBack: { value: back }, uLight: { value: 1 }, uOpacity: { value: 1 }, uGold: { value: 0 }, uTime: { value: 0 } },
    vertexShader: /* glsl */`
      varying vec2 vUv; varying vec3 vN; varying vec3 vV;
      void main() {
        vUv = uv;
        vN = normalize(normalMatrix * normal);
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vV = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */`
      uniform sampler2D tFront, tBack; uniform float uLight, uOpacity, uGold, uTime;
      varying vec2 vUv; varying vec3 vN; varying vec3 vV;
      void main() {
        vec4 t = gl_FrontFacing ? texture2D(tFront, vUv) : texture2D(tBack, vec2(1.0 - vUv.x, vUv.y));
        if (t.a < 0.5) discard;
        vec3 n = gl_FrontFacing ? vN : -vN;
        float facing = max(dot(n, vV), 0.0);
        float sheen = pow(max(dot(reflect(-normalize(vec3(0.4, 0.7, 0.6)), n), vV), 0.0), 18.0);
        vec3 c = t.rgb * (0.55 + 0.55 * facing) * uLight + vec3(1.0, 0.85, 0.6) * sheen * 0.35;
        // golden ticket: foil sweep
        float lum = dot(t.rgb, vec3(0.3, 0.59, 0.11));
        vec3 gold = vec3(1.0, 0.74, 0.28) * (0.35 + lum * 1.4);
        float sweep = smoothstep(0.08, 0.0, abs(fract(vUv.x * 0.6 - vUv.y * 0.3 - uTime * 0.25) - 0.5));
        c = mix(c, gold * (0.9 + facing * 0.5) + sweep * 1.4, uGold);
        gl_FragColor = vec4(c, uOpacity);
      }
    `,
    side: THREE.DoubleSide, transparent: true, depthTest: false, depthWrite: false,
  });
}

function part(u0: number, u1: number, mat: THREE.ShaderMaterial) {
  const g = new THREE.PlaneGeometry((u1 - u0) * TW, TH, 1, 1);
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) === 0 ? u0 : u1);
  const m = new THREE.Mesh(g, mat);
  m.renderOrder = 1000;
  return m;
}

export function Ticket() {
  const tx = useTextures('ticket_front', 'ticket_back');
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;

  const b = useMemo(() => {
    const mat = ticketMaterial(tx.ticket_front, tx.ticket_back);
    const stubMat = mat.clone();
    const rig = new THREE.Group();
    const spin = new THREE.Group();
    rig.add(spin);
    const main = part(0, PERF, mat);
    main.position.x = (PERF / 2 - 0.5) * TW;
    // the stub hinges at the perforation, so dragging peels it back like paper
    const hinge = new THREE.Group();
    hinge.position.x = (PERF - 0.5) * TW;
    const stub = part(PERF, 1, stubMat);
    stub.position.x = ((1 - PERF) / 2) * TW;
    hinge.add(stub);
    spin.add(main, hinge);
    const curtain = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.MeshBasicMaterial({ color: 0x050204, transparent: true, depthTest: false, depthWrite: false, fog: false }));
    curtain.position.z = -30;
    curtain.renderOrder = 900;
    const hit = new THREE.Mesh(new THREE.PlaneGeometry(TW, TH * 0.66), new THREE.MeshBasicMaterial({ visible: false }));
    spin.add(hit);
    return { mat, stubMat, rig, spin, main, hinge, stub, curtain, hit };
  }, [tx]);

  const s = useMemo(() => ({ mode: 'loader' as 'loader' | 'torn' | 'hidden' | 'finale' | 'leaving', level: 0, claimed: false, peel: 0 }), []);

  useEffect(() => {
    camera.add(b.rig, b.curtain);
    const reset = () => {
      b.main.position.set((PERF / 2 - 0.5) * TW, 0, 0); b.main.rotation.set(0, 0, 0);
      b.hinge.position.set((PERF - 0.5) * TW, 0, 0); b.hinge.rotation.set(0, 0, 0);
      b.stub.position.set(((1 - PERF) / 2) * TW, 0, 0); b.stub.rotation.set(0, 0, 0);
      b.mat.uniforms.uOpacity.value = b.stubMat.uniforms.uOpacity.value = 1;
    };

    bridge.tear = async () => {
      if (s.mode !== 'loader') return;
      s.mode = 'torn';
      audio.tear();
      b.spin.updateWorldMatrix(true, true);
      debrisApi.burst(b.spin.localToWorld(new THREE.Vector3((PERF - 0.5) * TW, 0, 0)), 90, 3.2);
      const h0 = b.hinge.position.clone(), r0 = b.hinge.rotation.clone(), m0 = b.main.position.clone();
      await Promise.all([
        tween({ duration: 1.5, ease: ease.linear, onUpdate: (k) => {
          b.hinge.position.set(h0.x + k * 1.6, h0.y + Math.sin(k * 2.6) * 0.6 - k * k * 4.5, h0.z + k * 1.2);
          b.hinge.rotation.set(r0.x + k * 2.2, r0.y + k * 1.8, r0.z - k * 3.4);
          b.stubMat.uniforms.uOpacity.value = 1 - Math.max(0, k - 0.6) / 0.4;
        } }),
        tween({ duration: 1.3, delay: 0.1, ease: ease.inCubic, onUpdate: (k) => {
          b.main.position.set(m0.x - k * 1.4, m0.y - k * 2.2, m0.z + k * 3.2);
          b.main.rotation.set(-k * 0.9, k * 0.6, k * 0.5);
          b.mat.uniforms.uOpacity.value = 1 - Math.max(0, k - 0.5) / 0.5;
        } }),
        tween({ duration: 1.8, delay: 0.25, ease: ease.inOutSine, onUpdate: (k) => { (b.curtain.material as THREE.MeshBasicMaterial).opacity = 1 - k; } }),
      ]);
      b.curtain.visible = false;
      b.rig.visible = false;
      s.mode = 'hidden';
      reset();
    };

    bridge.claim = async () => {
      if (s.claimed) return;
      s.claimed = true;
      const golden = useUI.getState().golden;
      if (golden) b.mat.uniforms.uGold.value = b.stubMat.uniforms.uGold.value = 1;
      if (s.mode === 'finale') {
        const from = b.spin.rotation.y;
        await tween({ duration: 1.0, ease: ease.outBack, onUpdate: (k) => { b.spin.rotation.y = from + k * Math.PI; } });
        b.spin.updateWorldMatrix(true, false);
        debrisApi.burst(b.spin.localToWorld(new THREE.Vector3()), 80, 4);
      }
      setTimeout(() => { s.claimed = false; }, 1200);
    };

    // Tickets close when you click them.
    bridge.dismissFinaleTicket = () => {
      if (s.mode !== 'finale') return;
      s.mode = 'leaving';
      audio.whoosh();
      useUI.getState().set({ finaleTicket: false });
      const p0 = b.rig.position.clone();
      tween({ duration: 0.7, ease: ease.inCubic, onUpdate: (k) => {
        b.rig.position.set(p0.x - k * 0.6, p0.y + k * 2.6, p0.z - k * 1.5);
        b.spin.rotation.z = k * 1.4;
        b.mat.uniforms.uOpacity.value = b.stubMat.uniforms.uOpacity.value = 1 - k;
      }, onComplete: () => { b.rig.visible = false; s.mode = 'hidden'; s.level = 0; b.spin.rotation.z = 0; reset(); } });
    };
    const off = register({ object: b.hit, enabled: () => s.mode === 'finale', onClick: () => bridge.dismissFinaleTicket() });
    return () => { off(); camera.remove(b.rig, b.curtain); };
  }, [b, s, camera]);

  useFrame(() => {
    const t = ride.t, dt = ride.dt, time = ride.time;
    b.mat.uniforms.uTime.value = b.stubMat.uniforms.uTime.value = time;
    const z = -4.4;
    const h = 2 * Math.abs(z) * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const w = h * camera.aspect;
    if (s.mode === 'loader') {
      b.rig.position.set(0, 0.12, z);
      b.rig.scale.setScalar(Math.min(1, (w * 0.82) / TW));
      // drag-to-tear: the stub peels back on its hinge, the ticket leans into your pull
      s.peel = damp(s.peel, ride.tearDrag, 18, dt);
      b.hinge.rotation.set(0, -s.peel * 1.1, -s.peel * 0.35);
      b.hinge.position.set((PERF - 0.5) * TW + s.peel * 0.25, -s.peel * 0.15, s.peel * 0.3);
      b.spin.rotation.y = (Math.sin(time * 0.7) * 0.55 + (1 - useUI.getState().progress) * Math.sin(time * 2.1) * 0.08) * (1 - s.peel);
      b.spin.rotation.x = Math.sin(time * 0.5) * 0.12 * (1 - s.peel);
      b.spin.rotation.z = Math.sin(time * 0.35) * 0.04 - s.peel * 0.06;
      b.spin.position.y = Math.sin(time * 1.1) * 0.05;
      b.mat.uniforms.uLight.value = b.stubMat.uniforms.uLight.value = 0.75 + useUI.getState().progress * 0.4;
      return;
    }
    if (s.mode === 'torn' || s.mode === 'leaving') return;
    const want = t > 0.95 && useUI.getState().finaleTicket && !useUI.getState().boxOffice ? 1 : 0;
    s.level = damp(s.level, want, 3, dt);
    if (s.level < 0.005) { b.rig.visible = false; if (s.mode === 'finale') s.mode = 'hidden'; return; }
    if (s.mode === 'hidden') { b.spin.rotation.set(0, -0.6, 0); s.mode = 'finale'; }
    b.rig.visible = true;
    const narrow = camera.aspect < 0.9;
    const sc = narrow ? Math.min(0.62, (w * 0.8) / TW) : Math.min(0.9, (w * 0.34) / TW);
    b.rig.position.set(narrow ? 0 : -w * 0.24, (narrow ? h * 0.27 : 0.05) - (1 - s.level) * h * 0.6, z);
    b.rig.scale.setScalar(sc * (0.6 + 0.4 * s.level));
    if (!s.claimed) b.spin.rotation.y = damp(b.spin.rotation.y, Math.sin(time * 0.6) * 0.45, 2, dt);
    b.spin.rotation.x = Math.sin(time * 0.5) * 0.1;
    b.spin.position.y = Math.sin(time * 1.1) * 0.05;
    const gold = useUI.getState().golden ? 1 : 0;
    b.mat.uniforms.uGold.value = b.stubMat.uniforms.uGold.value = damp(b.mat.uniforms.uGold.value, gold, 2, dt);
    b.mat.uniforms.uOpacity.value = b.stubMat.uniforms.uOpacity.value = s.level;
  });

  return null;
}
