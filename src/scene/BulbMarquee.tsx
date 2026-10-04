import * as THREE from 'three';
import { useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { ride } from '../state/ride';
import { U } from '../three/materials';
import { samplePoints, smoothstep } from '../lib/utils';

/**
 * Words spelled in hundreds of real bulbs, strung across the midway. Each bulb
 * knows its left-to-right order, so the sign "powers up" letter by letter as
 * you approach, with a few that fizzle and die.
 */
export function BulbMarquee({ text, position, width, reveal, visible, font = 'Rye' }: {
  text: string; position: [number, number, number]; width: number; reveal: [number, number]; visible: [number, number]; font?: string;
}) {
  const { mesh, mat } = useMemo(() => {
    const W = 1600, H = 260;
    const pts = samplePoints((g, w, h) => {
      g.fillStyle = '#fff';
      g.font = `400 ${h * 0.78}px ${font}, Georgia, serif`;
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(text, w / 2, h * 0.54);
    }, W, H, 11);
    const base = new THREE.SphereGeometry(width * 0.0036, 8, 6);
    const geo = new THREE.InstancedBufferGeometry();
    geo.index = base.index;
    geo.setAttribute('position', base.attributes.position);
    geo.setAttribute('normal', base.attributes.normal);
    const n = pts.length;
    const aPos = new Float32Array(n * 3), aOrder = new Float32Array(n), aSeed = new Float32Array(n);
    pts.forEach((p, i) => {
      aPos.set([p.x * width, p.y * width, 0], i * 3);
      aOrder[i] = p.x + 0.5;
      aSeed[i] = Math.random();
    });
    geo.setAttribute('aPos', new THREE.InstancedBufferAttribute(aPos, 3));
    geo.setAttribute('aOrder', new THREE.InstancedBufferAttribute(aOrder, 1));
    geo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(aSeed, 1));
    geo.instanceCount = n;
    const mat = new THREE.ShaderMaterial({
      uniforms: { uReveal: { value: 0 }, uTime: U.uTime, uPower: U.uPower, uBeat: U.uBeat, uColor: { value: new THREE.Color(1, 0.72, 0.42) } },
      vertexShader: /* glsl */`
        attribute vec3 aPos; attribute float aOrder; attribute float aSeed;
        uniform float uReveal, uTime, uPower, uBeat;
        varying float vI;
        void main() {
          float on = smoothstep(aOrder - 0.02, aOrder + 0.02, uReveal * 1.15 - 0.05);
          float stutter = step(0.9, fract(sin(floor(uTime * 14.0 + aSeed * 91.0) * 12.9898) * 43758.5453));
          float dying = step(0.94, aSeed);                      // a few bulbs never quite catch
          float f = on * (1.0 - stutter * (0.35 + dying * 0.6)) * (1.0 - dying * 0.55);
          vI = f * uPower * (6.0 + uBeat * 2.0) * (0.85 + 0.15 * sin(uTime * 3.0 + aSeed * 30.0));
          gl_Position = projectionMatrix * modelViewMatrix * vec4(aPos + position, 1.0);
        }
      `,
      fragmentShader: /* glsl */`
        uniform vec3 uColor; varying float vI;
        void main() { gl_FragColor = vec4(uColor * (0.05 + vI), 1.0); }
      `,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.frustumCulled = false;
    return { mesh, mat };
  }, [text, width, font]);

  useFrame(() => {
    const t = ride.t;
    mesh.visible = t > visible[0] && t < visible[1];
    mat.uniforms.uReveal.value = smoothstep(reveal[0], reveal[1], t);
  });

  return <primitive object={mesh} position={position} />;
}
