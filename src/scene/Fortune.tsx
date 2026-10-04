import * as THREE from 'three';
import { useEffect, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { FORTUNES, LAYOUT, T } from '../config';
import { bridge, ride, useUI } from '../state/ride';
import { audio } from '../lib/audio';
import { useBulbs, useTextures, variant } from '../three/assets';
import { createBulbs, createGlows, electric, stackedCutout } from '../three/materials';
import { damp, ease, roundedRectAlpha, tween } from '../lib/utils';
import { register } from './interactions';

const MW = 2.7, MH = MW * 1.5;
const mp = (x: number, y: number) => new THREE.Vector3((x / 1024 - 0.5) * MW, (1 - y / 1536) * MH, 0);
export const fortuneActive = () => ride.t > 0.56 && ride.t < 0.645;

export function Fortune() {
  const tx = useTextures('fortune_machine', 'tex_velvet_curtain', 'tex_tent_stripes', 'card_back', 'card_the_jester', 'card_the_ringmaster', 'card_the_red_balloon', 'card_the_wheel');
  const bulbs = useBulbs();
  const camera = useThree((s) => s.camera);

  const b = useMemo(() => {
    const group = new THREE.Group();
    group.position.copy(LAYOUT.fortune);
    group.rotation.y = Math.atan2(LAYOUT.fortuneFacing.x, LAYOUT.fortuneFacing.z);

    const rug = new THREE.Mesh(new THREE.CircleGeometry(3.4, 48), new THREE.MeshStandardMaterial({ map: variant(tx.tex_velvet_curtain, 2, 2, THREE.MirroredRepeatWrapping), roughness: 1, color: 0x7a3a5a }));
    rug.rotation.x = -Math.PI / 2; rug.position.y = 0.02;
    group.add(rug);
    const brass = new THREE.MeshStandardMaterial({ color: 0xb78a3e, metalness: 0.85, roughness: 0.35 });
    const stripes = variant(tx.tex_tent_stripes, 2, 1);
    const canopy = new THREE.Mesh(new THREE.ConeGeometry(3.9, 2.6, 4, 1, true), new THREE.MeshStandardMaterial({ map: stripes, side: THREE.DoubleSide, roughness: 0.9, emissive: 0xffffff, emissiveMap: stripes, emissiveIntensity: 0.1 }));
    canopy.rotation.y = Math.PI / 4; canopy.position.y = 6.6;
    group.add(canopy);
    const corners: THREE.Vector3[] = [];
    for (const [x, z] of [[-2.6, -2.2], [2.6, -2.2], [-2.6, 2.4], [2.6, 2.4]]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 5.4, 10), brass);
      post.position.set(x, 2.7, z);
      group.add(post);
      corners.push(new THREE.Vector3(x, 5.35, z));
    }
    const fringe: THREE.Vector3[] = [];
    const order = [0, 1, 3, 2, 0];
    for (let s = 0; s < 4; s++) for (let i = 0; i < 10; i++) fringe.push(new THREE.Vector3().lerpVectors(corners[order[s]], corners[order[s + 1]], i / 10));
    group.add(createBulbs(fringe, { radius: 0.075, intensity: 6, chase: 0.9, chaseSpeed: 1, color: new THREE.Color(1, 0.55, 0.3) }));

    const machine = stackedCutout(tx.fortune_machine, MW, MH, { layers: 8, depth: 0.7, tint: new THREE.Color(1, 0.95, 0.92), edge: 0x250c08 });
    machine.position.set(0, MH / 2, -0.6);
    group.add(machine);
    const mRoot = new THREE.Group();
    mRoot.position.set(0, 0, -0.56);
    group.add(mRoot);
    mRoot.add(createGlows((bulbs.fortune_machine || []).map(([u, v, r]) => ({ p: new THREE.Vector3((u - 0.5) * MW, (1 - v) * MH, 0.02), s: Math.max(r * MW * 7, 0.3) })), { intensity: 1.4 }));
    const ball = createGlows([{ p: mp(510, 762), s: 1.3, color: new THREE.Color(0.7, 0.35, 1.0) }], { intensity: 1.2, flicker: 0 });
    const eyes = createGlows([{ p: mp(466, 466), s: 0.22, color: new THREE.Color(1, 0.8, 0.25) }, { p: mp(540, 466), s: 0.22, color: new THREE.Color(1, 0.8, 0.25) }], { intensity: 0.8, flicker: 0 });
    const slotGlow = createGlows([{ p: mp(512, 1052).add(new THREE.Vector3(0, 0, 0.05)), s: 0.9, color: new THREE.Color(1, 0.5, 0.2) }], { intensity: 0, flicker: 0 });
    mRoot.add(ball, eyes, slotGlow);
    const candle = electric(new THREE.PointLight(0xff9a50, 14, 9, 1.6));
    candle.position.set(0.9, 2.6, 1.4);
    const crystal = new THREE.PointLight(0x9b5cff, 6, 7, 1.8);
    crystal.position.copy(mp(510, 762)).add(new THREE.Vector3(0, 0, 0.2));
    group.add(candle, crystal);
    const hit = new THREE.Mesh(new THREE.PlaneGeometry(MW * 0.8, MH * 0.95), new THREE.MeshBasicMaterial({ visible: false }));
    hit.position.set(0, MH / 2, 0.05);
    mRoot.add(hit);

    // tarot card: thin box with rounded corners via alphaMap
    const alpha = roundedRectAlpha(256, 384, 26);
    const edgeMat = new THREE.MeshStandardMaterial({ color: 0xb08a3a, metalness: 0.7, roughness: 0.4 });
    const backMat = new THREE.MeshBasicMaterial({ map: tx.card_back, alphaMap: alpha, alphaTest: 0.5, fog: false });
    const faceMats = FORTUNES.map((f) => new THREE.MeshBasicMaterial({ map: tx[f.key as keyof typeof tx], alphaMap: alpha, alphaTest: 0.5, fog: false }));
    const card = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.93, 0.006), [edgeMat, edgeMat, edgeMat, edgeMat, faceMats[0], backMat] as THREE.Material[]);
    card.visible = false;
    card.renderOrder = 20;
    mRoot.add(card); // hidden until dispensed; in the graph so Ready compiles its materials
    return { group, mRoot, ball, eyes, slotGlow, candle, crystal, hit, card, faceMats };
  }, [tx, bulbs]);

  const s = useMemo(() => ({ busy: false, cardOut: false, lastIdx: -1, glow: 0, restY: -0.02 }), []);

  useEffect(() => {
    const { mRoot, card, faceMats } = b;
    const setUI = useUI.getState().set;

    const stow = () => {
      if (!s.cardOut || s.busy) return;
      s.cardOut = false;
      setUI({ cardOut: false });
      audio.whoosh();
      const from = card.position.clone(), rz = card.rotation.z;
      tween({ duration: 0.55, ease: ease.inCubic, onUpdate: (k) => {
        card.position.lerpVectors(from, from.clone().add(new THREE.Vector3(0.9, -1.4, 0.3)), k);
        card.rotation.z = rz + k * 0.9;
      }, onComplete: () => { if (!s.busy) { card.visible = false; card.parent?.remove(card); } } });
    };

    bridge.dismissCard = stow;
    bridge.dispense = async () => {
      if (s.busy) return;
      if (!fortuneActive()) { bridge.rideTo(0.6); return; }
      s.busy = true;
      setUI({ fortuneBusy: true });
      audio.coin();
      if (s.cardOut) { s.cardOut = false; const from = card.position.clone(); await tween({ duration: 0.4, ease: ease.inCubic, onUpdate: (k) => { card.position.lerpVectors(from, from.clone().add(new THREE.Vector3(1.6, -1.2, 0.5)), k); card.rotation.z = k * 1.2; } }); }
      let idx: number; do { idx = (Math.random() * FORTUNES.length) | 0; } while (idx === s.lastIdx);
      s.lastIdx = idx;
      (card.material as THREE.Material[])[4] = faceMats[idx];
      audio.whir();
      await tween({ duration: 1.1, ease: ease.inOutSine, onUpdate: (k) => { s.glow = Math.sin(k * Math.PI) + k * 0.4; } });

      mRoot.add(card);
      card.visible = true;
      const slot = mp(512, 1052);
      card.position.copy(slot).add(new THREE.Vector3(0, 0, -0.1));
      card.rotation.set(-Math.PI / 2, 0, 0);
      audio.whoosh();
      await tween({ duration: 0.5, ease: ease.outCubic, onUpdate: (k) => { card.position.z = -0.1 + k * 0.55; card.position.y = slot.y + k * 0.05; } });

      camera.add(card);
      mRoot.updateWorldMatrix(true, false);
      camera.updateMatrixWorld();
      const start = mRoot.localToWorld(slot.clone().add(new THREE.Vector3(0, 0.05, 0.45)));
      camera.worldToLocal(start);
      const end = ride.narrow ? new THREE.Vector3(0, 0.3, -2.3) : new THREE.Vector3(-0.3, -0.02, -1.75);
      s.restY = end.y;
      const startQ = camera.quaternion.clone().invert().multiply(mRoot.getWorldQuaternion(new THREE.Quaternion()).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0))));
      const endQ = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.PI, 0.06));
      card.position.copy(start); card.quaternion.copy(startQ);
      await tween({ duration: 0.9, ease: ease.inOutCubic, onUpdate: (k) => {
        card.position.lerpVectors(start, end, k);
        card.position.y += Math.sin(k * Math.PI) * 0.25;
        card.quaternion.slerpQuaternions(startQ, endQ, k);
      } });
      audio.flip();
      const flipFrom = card.quaternion.clone();
      const flipTo = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, -0.05));
      await tween({ duration: 0.7, ease: ease.outBack, onUpdate: (k) => { card.quaternion.slerpQuaternions(flipFrom, flipTo, Math.min(k, 1.05)); card.position.z = end.z + Math.sin(k * Math.PI) * 0.2; } });
      s.cardOut = true;
      s.busy = false;
      setUI({ fortune: FORTUNES[idx], fortuneBusy: false, cardOut: true });
    };

    const offMachine = register({ object: b.hit, enabled: () => fortuneActive() && !s.busy, onClick: () => bridge.dispense() });
    const offCard = register({ object: card, enabled: () => s.cardOut && !s.busy, onClick: () => stow() });
    return () => { offMachine(); offCard(); };
  }, [b, s, camera]);

  useFrame(() => {
    const t = ride.t, time = ride.time;
    const near = t > 0.5 && t < 0.72;
    b.group.visible = near || t > T.panorama;
    if (s.cardOut && !s.busy && (t < 0.56 || t > 0.645)) bridge.dismissCard();
    if (!near) return;
    if (s.cardOut && !s.busy) {
      b.card.rotation.y = Math.sin(time * 0.9) * 0.18;
      b.card.rotation.x = Math.sin(time * 0.7) * 0.06;
      b.card.position.y = s.restY + Math.sin(time * 1.3) * 0.02;
    }
    const pulse = 0.75 + 0.25 * Math.sin(time * 1.7) + 0.08 * Math.sin(time * 7.1);
    if (!s.busy) s.glow = damp(s.glow, 0, 0.8, ride.dt);
    const u = (m: THREE.Mesh) => (m.material as THREE.ShaderMaterial).uniforms;
    u(b.ball).uIntensity.value = (1.0 + s.glow * 3.5) * pulse;
    u(b.eyes).uIntensity.value = 0.6 + s.glow * 6;
    u(b.slotGlow).uIntensity.value = s.glow * 2.5;
    b.crystal.intensity = (6 + s.glow * 30) * pulse * ride.power;
  });

  return <primitive object={b.group} />;
}
