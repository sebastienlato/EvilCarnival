import * as THREE from 'three';
import { useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { LAYOUT, T } from '../config';
import { ride } from '../state/ride';
import { useTextures, variant } from '../three/assets';
import { U, createBulbs, createGlows, createWire, electric } from '../three/materials';
import { mulberry32, radialGlowTexture, sagPoints } from '../lib/utils';

const SIGNS = ['SHOOT THE CLOWN', 'RING TOSS OF TEETH', 'GUESS YOUR WEIGHT', 'HOOK-A-SOUL', 'COTTON CANDY', 'WHACK-A-MIME', 'DUNK THE MAYOR', 'CANDY APPLES · FRESH-ISH'];

function signTexture(text: string) {
  const c = document.createElement('canvas');
  c.width = 1024; c.height = 220;
  const g = c.getContext('2d')!;
  const grd = g.createLinearGradient(0, 0, 0, 220);
  grd.addColorStop(0, '#7a0c18'); grd.addColorStop(1, '#3e050c');
  g.fillStyle = grd; g.fillRect(0, 0, 1024, 220);
  g.strokeStyle = '#c9a227'; g.lineWidth = 10; g.strokeRect(14, 14, 996, 192);
  g.strokeStyle = 'rgba(201,162,39,.5)'; g.lineWidth = 3; g.strokeRect(30, 30, 964, 160);
  g.font = `400 ${text.length > 16 ? 70 : 88}px Rye, Georgia, serif`;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillStyle = '#2a0005'; g.fillText(text, 516, 118);
  g.fillStyle = '#f3e6c8'; g.fillText(text, 512, 112);
  for (let i = 0; i < 900; i++) {
    g.fillStyle = `rgba(${Math.random() < 0.5 ? '10,4,2' : '230,210,170'},${Math.random() * 0.12})`;
    g.fillRect(Math.random() * 1024, Math.random() * 220, Math.random() * 6, Math.random() * 3);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

interface BoothKit { wood: THREE.Material; stripeMat: THREE.Material; metal: THREE.Material; glowMat: THREE.MeshBasicMaterial }

function booth({ wood, stripeMat, metal, glowMat }: BoothKit, text: string, rnd: () => number) {
  const g = new THREE.Group();
  const back = new THREE.Mesh(new THREE.PlaneGeometry(6, 4.2), stripeMat);
  back.position.set(0, 2.1, -1.8);
  g.add(back);
  for (const s of [-1, 1]) {
    const side = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 4.2), stripeMat);
    side.rotation.y = Math.PI / 2; side.position.set(3 * s, 2.1, 0);
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 5.4, 8), metal);
    post.position.set(3 * s, 2.7, 1.8);
    g.add(side, post);
  }
  const counter = new THREE.Mesh(new THREE.BoxGeometry(6, 1.1, 0.7), wood);
  counter.position.set(0, 0.55, 1.5);
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(5.8, 3.2), glowMat);
  glow.position.set(0, 2.2, -1.7);
  const aw = new THREE.Mesh(new THREE.PlaneGeometry(6.6, 2.6), stripeMat);
  aw.position.set(0, 5.1, 1.2); aw.rotation.x = -Math.PI / 2 + 0.45;
  const roof = new THREE.Mesh(new THREE.ConeGeometry(4.4, 2.6, 4, 1, true), stripeMat);
  roof.rotation.y = Math.PI / 4; roof.scale.z = 0.85; roof.position.set(0, 5.6, -0.2);
  const signTex = signTexture(text);
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(5.4, 1.16), new THREE.MeshStandardMaterial({ map: signTex, emissive: 0xffffff, emissiveMap: signTex, emissiveIntensity: 0.45, roughness: 0.8 }));
  // hung on two short chains under the awning's front edge: any higher and the roof and
  // awning (which reach y 4.3–4.5 out to z 2.4) hide the lettering from the ride's eye line
  const SIGN_Y = 3.6, SIGN_Z = 2.2;
  sign.position.set(0, SIGN_Y, SIGN_Z); sign.rotation.z = (rnd() - 0.5) * 0.06;
  g.add(counter, glow, aw, roof, sign);
  for (const x of [-2.3, 2.3]) {
    const chain = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.5, 5), metal);
    chain.position.set(x, SIGN_Y + 0.58 + 0.25, SIGN_Z - 0.02);
    g.add(chain);
  }
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= 12; i++) pts.push(new THREE.Vector3(-3.2 + i * (6.4 / 12), 4.5, 2.3));
  g.add(createBulbs(pts, { radius: 0.07, intensity: 5, chase: 0.8, chaseSpeed: 1 }));
  return g;
}

export function Midway() {
  const tx = useTextures('tex_tent_stripes', 'tex_rusted_metal');
  const built = useMemo(() => {
    const group = new THREE.Group();
    const rnd = mulberry32(42);
    const stripes = variant(tx.tex_tent_stripes, 1.2, 0.6);
    const metal = new THREE.MeshStandardMaterial({ map: tx.tex_rusted_metal, roughness: 0.75, metalness: 0.35 });
    const poleGeo = new THREE.CylinderGeometry(0.14, 0.2, 10, 8);
    const lampPoints: { p: THREE.Vector3; s: number }[] = [];
    const zs = [-4, -14, -24, -34, -44];
    const bulbsAll: THREE.Vector3[] = [], phases: number[] = [];
    const top = (x: number, z: number) => new THREE.Vector3(x, 9.4, z);
    zs.forEach((z, i) => {
      for (const x of [-7.5, 7.5]) {
        const pole = new THREE.Mesh(poleGeo, metal);
        pole.position.set(x, 5, z);
        group.add(pole);
        lampPoints.push({ p: top(x, z).add(new THREE.Vector3(0, 0.5, 0)), s: 1.8 });
      }
      const runs: [THREE.Vector3, THREE.Vector3][] = [[top(-7.5, z), top(7.5, z)]];
      if (i < zs.length - 1) runs.push([top(-7.5, z), top(7.5, zs[i + 1])], [top(-7.5, z), top(-7.5, zs[i + 1])], [top(7.5, z), top(7.5, zs[i + 1])]);
      for (const [a, b] of runs) {
        const pts = sagPoints(a, b, 1.6 + rnd() * 0.8, 40);
        group.add(createWire(pts));
        for (let k = 1; k < pts.length - 1; k += 2) { bulbsAll.push(pts[k].clone().add(new THREE.Vector3(0, -0.1, 0))); phases.push(k / 2); }
      }
    });
    for (const x of [-7.5, 7.5]) {
      const pts = sagPoints(top(x, -44), new THREE.Vector3(x * 0.8, 9.8, -56.5), 1.8, 30);
      group.add(createWire(pts));
      for (let k = 1; k < pts.length - 1; k += 2) { bulbsAll.push(pts[k].clone()); phases.push(k / 2); }
    }
    group.add(createBulbs(bulbsAll, { radius: 0.075, intensity: 3.6, chase: 0.35, chaseSpeed: 0.5, phases }));
    group.add(createGlows(lampPoints, { intensity: 1.2 }));

    // every booth shares one set of materials
    const kit: BoothKit = {
      wood: new THREE.MeshStandardMaterial({ color: 0x3a2014, roughness: 0.9 }),
      stripeMat: new THREE.MeshStandardMaterial({ map: stripes, roughness: 0.95, side: THREE.DoubleSide }),
      metal: new THREE.MeshStandardMaterial({ map: tx.tex_rusted_metal, roughness: 0.8, metalness: 0.3 }),
      glowMat: new THREE.MeshBasicMaterial({ color: new THREE.Color(0.9, 0.35, 0.12), transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false }),
    };
    const spots: [number, number, number][] = [[-12.5, -10, 0.5], [12.5, -12, -0.5], [-12.5, -27, 0.35], [12.5, -29, -0.4], [-13, -44, 0.6], [13, -46, -0.7], [22, -84, -1.9], [-20, -96, 1.2]];
    spots.forEach(([x, z, ry], i) => {
      const g = booth(kit, SIGNS[i % SIGNS.length], rnd);
      g.position.set(x, 0, z);
      g.rotation.y = -ry + (x < 0 ? Math.PI / 2 : -Math.PI / 2);
      group.add(g);
    });
    const a = electric(new THREE.PointLight(0xff8a3c, 60, 30, 1.7)); a.position.set(0, 8, -12);
    const b = electric(new THREE.PointLight(0xff6a2c, 50, 30, 1.7)); b.position.set(0, 8, -36);
    group.add(a, b);
    return { group, glowMat: kit.glowMat };
  }, [tx]);

  useFrame(() => {
    const t = ride.t;
    built.group.visible = t < 0.58 || t > T.panorama;
    built.glowMat.opacity = 0.35 * U.uPower.value;
  });
  return <primitive object={built.group} />;
}

/* Paths between attractions: bulb strings on poles + warm light pools on the ground. */
const PATH: [number, number][] = [
  [0, -52], [7, -82], [14, -95], [6, -117], [-6, -128], [-3, -146], [-4, -174],
  [14, -175], [25, -196], [19, -227], [9, -246],
];

export function Walkways() {
  const tx = useTextures('tex_rusted_metal');
  const built = useMemo(() => {
    const group = new THREE.Group();
    const metal = new THREE.MeshStandardMaterial({ map: tx.tex_rusted_metal, roughness: 0.75, metalness: 0.35 });
    const poleGeo = new THREE.CylinderGeometry(0.1, 0.14, 7.5, 6);
    const left: THREE.Vector3[] = [], right: THREE.Vector3[] = [];
    PATH.forEach(([x, z], i) => {
      const prev = PATH[Math.max(i - 1, 0)], next = PATH[Math.min(i + 1, PATH.length - 1)];
      const dir = new THREE.Vector2(next[0] - prev[0], next[1] - prev[1]).normalize();
      const n = new THREE.Vector2(-dir.y, dir.x).multiplyScalar(4.6);
      for (const [side, arr] of [[1, left], [-1, right]] as const) {
        const p = new THREE.Vector3(x + n.x * side, 0, z + n.y * side);
        const pole = new THREE.Mesh(poleGeo, metal);
        pole.position.copy(p).setY(3.75);
        group.add(pole);
        arr.push(p.clone().setY(7.2));
      }
    });
    const pts: THREE.Vector3[] = [], ph: number[] = [];
    for (const arr of [left, right]) {
      for (let i = 0; i < arr.length - 1; i++) {
        const seg = sagPoints(arr[i], arr[i + 1], 1.3, 22);
        group.add(createWire(seg));
        for (let k = 1; k < seg.length - 1; k += 2) { pts.push(seg[k]); ph.push(i * 11 + k); }
      }
    }
    group.add(createBulbs(pts, { radius: 0.08, intensity: 4.2, chase: 0.6, chaseSpeed: 0.5, phases: ph }));

    const poolTex = radialGlowTexture('rgba(255,170,90,0.9)', 'rgba(255,110,40,0.35)', 256);
    const pools: [number, number, number][] = [
      [LAYOUT.gate.x, 8, 16], [0, -24, 18], [LAYOUT.carousel.x, LAYOUT.carousel.z, 22],
      [LAYOUT.mirrors.x, LAYOUT.mirrors.z, 15], [LAYOUT.fortune.x, LAYOUT.fortune.z, 10],
      [5, -155, 13], [LAYOUT.bigtop.x, LAYOUT.bigtop.z + 20, 16], [LAYOUT.wheel.x, LAYOUT.wheel.z, 26],
      ...PATH.map(([x, z]) => [x, z, 9] as [number, number, number]),
    ];
    const poolMat = new THREE.MeshBasicMaterial({ map: poolTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, opacity: 0.45 });
    const geo = new THREE.PlaneGeometry(1, 1);
    for (const [x, z, r] of pools) {
      const m = new THREE.Mesh(geo, poolMat);
      m.rotation.x = -Math.PI / 2;
      m.position.set(x, 0.06, z);
      m.scale.setScalar(r * 2);
      m.renderOrder = 2;
      group.add(m);
    }
    return { group, poolMat };
  }, [tx]);

  useFrame(() => {
    built.group.visible = ride.t > 0.18;
    built.poolMat.opacity = 0.45 * U.uPower.value;
  });
  return <primitive object={built.group} />;
}
