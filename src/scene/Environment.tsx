import * as THREE from 'three';
import { useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { MeshReflectorMaterial } from '@react-three/drei';
import { PALETTE } from '../config';
import { ride } from '../state/ride';
import { U } from '../three/materials';
import { useTextures, variant } from '../three/assets';
import { mulberry32, radialGlowTexture, smoothstep, damp } from '../lib/utils';
import { lightningBus } from './Director';

/* Cylindrical backdrop with horizon haze; lives outside the fog. */
function backdropMaterial(tex: THREE.Texture, repeat: number, { brightness = 1, haze = new THREE.Color('#2a1422'), hazeAmt = 0.5, sky = false }) {
  return new THREE.ShaderMaterial({
    uniforms: {
      map: { value: tex }, uRepeat: { value: repeat }, uBright: { value: brightness },
      uHaze: { value: haze }, uHazeAmt: { value: hazeAmt },
      uPower: U.uPower, uLightning: U.uLightning,
    },
    vertexShader: /* glsl */`varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */`
      uniform sampler2D map; uniform float uRepeat, uBright, uHazeAmt, uPower, uLightning; uniform vec3 uHaze;
      varying vec2 vUv;
      void main() {
        vec4 t = texture2D(map, vec2(vUv.x * uRepeat, vUv.y));
        ${sky ? '' : 'if (t.a < 0.02) discard;'}
        float h = smoothstep(0.55, 0.0, vUv.y);
        vec3 c = t.rgb * uBright * mix(0.8, 1.0, uPower);
        ${sky
          ? 'c += (t.rgb * vec3(1.6, 1.8, 2.6) + vec3(0.05, 0.06, 0.12)) * uLightning * 2.2;'
          : 'c = mix(c, c * 0.25, uLightning * 0.6);'}
        c = mix(c, uHaze * (1.0 + uLightning * ${sky ? '0.0' : '2.0'}), h * uHazeAmt);
        gl_FragColor = vec4(c, ${sky ? '1.0' : 't.a'});
      }
    `,
    side: THREE.BackSide,
    transparent: !sky,
    depthWrite: !sky,
    fog: false,
  });
}

function Backdrop({ tex, radius, repeat, bottom, center, sky = false, ...opts }: { tex: THREE.Texture; radius: number; repeat: number; bottom: number; center: THREE.Vector3; sky?: boolean; brightness?: number; haze?: THREE.Color; hazeAmt?: number }) {
  const { geo, mat, height } = useMemo(() => {
    const img = tex.image as { width: number; height: number };
    const height = (2 * Math.PI * radius) / repeat / (img.width / img.height);
    return { geo: new THREE.CylinderGeometry(radius, radius, height, 96, 1, true), mat: backdropMaterial(tex, repeat, { ...opts, sky }), height };
  }, [tex, radius, repeat]); // eslint-disable-line react-hooks/exhaustive-deps
  return <mesh geometry={geo} material={mat} position={[center.x, bottom + height / 2, center.z]} renderOrder={sky ? -10 : -5} frustumCulled={false} />;
}

/* A jagged bolt ribbon, regenerated for each strike. */
function makeBolt(seed: number) {
  const rnd = mulberry32((seed * 1e6) | 0);
  const pts: THREE.Vector3[] = [];
  let x = 0;
  for (let i = 0; i <= 24; i++) {
    const y = 1 - i / 24;
    x += (rnd() - 0.5) * 0.12;
    pts.push(new THREE.Vector3(x, y, 0));
  }
  const pos: number[] = [], idx: number[] = [];
  pts.forEach((p, i) => {
    const w = 0.012 * (1 - i / pts.length * 0.6);
    pos.push(p.x - w, p.y, 0, p.x + w, p.y, 0);
    if (i < pts.length - 1) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  return g;
}

export function Environment() {
  const tx = useTextures('sky_night_panorama', 'moon_blood', 'treeline_silhouette', 'carnival_skyline_silhouette', 'tex_ground_sawdust', 'smoke_puff', 'ringmaster_hero');
  const scene = useThree((s) => s.scene);
  const skyRig = useRef<THREE.Group>(null!);
  const moon = useRef<THREE.Group>(null!);
  const giant = useRef<THREE.Mesh>(null!);
  const bolt = useRef<THREE.Mesh>(null!);
  const hemi = useRef<THREE.HemisphereLight>(null!);
  const moonLight = useRef<THREE.DirectionalLight>(null!);
  const boltState = useRef({ life: 0 });

  // a layout effect: useFrame subscribes in one too, so a frame can't run before the fog exists
  useLayoutEffect(() => {
    scene.fog = new THREE.FogExp2(PALETTE.fog, 0.0145);
    scene.background = PALETTE.fog.clone().multiplyScalar(0.6);
    lightningBus.strike = (x: number) => {
      const b = bolt.current;
      b.geometry.dispose();
      b.geometry = makeBolt(x + Math.random());
      const ang = (x - 0.5) * 1.4 + (ride.t > 0.84 ? Math.PI : 0);
      b.position.set(Math.sin(ang) * -430, -40, -Math.cos(ang) * 430);
      b.lookAt(0, -40, 0);
      boltState.current.life = 0.45;
    };
    return () => { scene.fog = null; };
  }, [scene]);

  const haloTex = useMemo(() => radialGlowTexture('rgba(255,90,70,0.9)', 'rgba(170,20,40,0.35)', 256), []);
  const moonDirA = useMemo(() => new THREE.Vector3(-0.32, 0.46, -1).normalize(), []);
  const moonDirB = useMemo(() => new THREE.Vector3(0.42, 0.36, 1).normalize(), []);
  const tmp = useMemo(() => new THREE.Vector3(), []);
  const groundTex = useMemo(() => variant(tx.tex_ground_sawdust, 170, 170, THREE.MirroredRepeatWrapping), [tx]);

  const giantMat = useMemo(() => new THREE.MeshBasicMaterial({ map: tx.ringmaster_hero, color: 0x000000, transparent: true, opacity: 0, depthWrite: false, fog: false }), [tx]);
  const boltMat = useMemo(() => new THREE.MeshBasicMaterial({ color: new THREE.Color(6, 7, 12), transparent: true, opacity: 0, depthWrite: false, fog: false, side: THREE.DoubleSide, toneMapped: false }), []);
  const boltGeo = useMemo(() => makeBolt(0.3), []);

  /* rolling ground fog billboards */
  const smoke = useMemo(() => {
    const rnd = mulberry32(7);
    const N = ride.quality === 'high' ? 150 : 80;
    const base = new THREE.PlaneGeometry(1, 1);
    const geo = new THREE.InstancedBufferGeometry();
    geo.index = base.index;
    geo.setAttribute('position', base.attributes.position);
    geo.setAttribute('uv', base.attributes.uv);
    const aOff = new Float32Array(N * 3), aData = new Float32Array(N * 4);
    for (let i = 0; i < N; i++) {
      const z = 30 - rnd() * 300;
      aOff.set([(rnd() - 0.5) * (z < -240 ? 70 : 56), 0.6 + rnd() * 2.2, z], i * 3);
      aData.set([7 + rnd() * 10, rnd() * 6.28, 0.1 + rnd() * 0.16, rnd()], i * 4);
    }
    geo.setAttribute('aOff', new THREE.InstancedBufferAttribute(aOff, 3));
    geo.setAttribute('aData', new THREE.InstancedBufferAttribute(aData, 4));
    geo.instanceCount = N;
    const mat = new THREE.ShaderMaterial({
      uniforms: { map: { value: tx.smoke_puff }, uTime: U.uTime, uLightning: U.uLightning, uColor: { value: new THREE.Color('#7d6a8e') }, uFogColor: { value: PALETTE.fog }, uOpacity: { value: 1 } },
      vertexShader: /* glsl */`
        attribute vec3 aOff; attribute vec4 aData;
        uniform float uTime;
        varying vec2 vUv; varying float vA; varying float vFog;
        void main() {
          float seed = aData.w;
          vec3 p = aOff + vec3(sin(uTime * 0.05 + seed * 20.0) * 4.0, sin(uTime * 0.2 + seed * 9.0) * 0.3, cos(uTime * 0.04 + seed * 13.0) * 3.0);
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          float ang = aData.y + uTime * (0.02 + seed * 0.05) * (seed > 0.5 ? 1.0 : -1.0);
          mv.xy += mat2(cos(ang), -sin(ang), sin(ang), cos(ang)) * position.xy * aData.x;
          float d = -mv.z;
          vA = aData.z * smoothstep(2.0, 9.0, d);
          vFog = 1.0 - exp(-pow(d * 0.012, 2.0));
          vUv = uv;
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: /* glsl */`
        uniform sampler2D map; uniform vec3 uColor, uFogColor; uniform float uOpacity, uLightning;
        varying vec2 vUv; varying float vA; varying float vFog;
        void main() {
          float a = texture2D(map, vUv).a * vA * uOpacity;
          vec3 c = mix(uColor, uFogColor, vFog * 0.7) * (1.0 + uLightning * 2.5);
          gl_FragColor = vec4(c, a);
        }
      `,
      transparent: true, depthWrite: false,
    });
    return { geo, mat };
  }, [tx]);

  useFrame(({ camera }) => {
    const t = ride.t;
    skyRig.current.position.copy(camera.position);
    const k = smoothstep(0.84, 0.95, t);
    tmp.copy(moonDirA).lerp(moonDirB, k).normalize();
    moon.current.position.copy(tmp).multiplyScalar(440);
    moon.current.lookAt(camera.position);
    const climb = smoothstep(0.875, 0.95, t);
    (scene.fog as THREE.FogExp2).density = THREE.MathUtils.lerp(0.0145, 0.0042, climb) * (1 - ride.lightning * 0.35);
    smoke.mat.uniforms.uOpacity.value = 1 - climb * 0.5;

    // the storm shows you who's watching
    const L = ride.lightning;
    giantMat.opacity = Math.min(L * 1.4, 0.92);
    giantMat.color.setRGB(L * 0.05, L * 0.03, L * 0.06);
    const g = giant.current;
    const ang = t > 0.84 ? Math.PI * 0.95 : -0.35;
    g.position.set(Math.sin(ang) * -470, 150, -Math.cos(ang) * 470);
    g.lookAt(0, 150, 0);
    boltState.current.life = Math.max(0, boltState.current.life - ride.dt);
    boltMat.opacity = boltState.current.life > 0 ? Math.min(1, L * 3 + (Math.random() < 0.3 ? 0.4 : 0)) : 0;
    bolt.current.visible = boltMat.opacity > 0.01;

    hemi.current.intensity = damp(hemi.current.intensity, (1.1 + L * 6) * (1 - ride.darkness * 0.92), 30, ride.dt);
    moonLight.current.intensity = (0.9 + L * 5) * (1 - ride.darkness * 0.95);
  });

  const center = useMemo(() => new THREE.Vector3(0, 0, -130), []);
  return (
    <>
      <group ref={skyRig}>
        <Backdrop tex={tx.sky_night_panorama} radius={520} repeat={3} bottom={-110} center={new THREE.Vector3()} brightness={1.15} hazeAmt={0} sky />
        <mesh rotation-x={Math.PI / 2} position-y={560} renderOrder={-10}>
          <circleGeometry args={[520, 48]} />
          <meshBasicMaterial color={0x07040a} fog={false} side={THREE.DoubleSide} depthWrite={false} />
        </mesh>
        <mesh ref={giant} material={giantMat} renderOrder={-9} frustumCulled={false}>
          <planeGeometry args={[320, 480]} />
        </mesh>
        <mesh ref={bolt} geometry={boltGeo} material={boltMat} scale={[420, 330, 1]} renderOrder={-8} frustumCulled={false} />
        <group ref={moon}>
          <mesh renderOrder={-9}>
            <planeGeometry args={[250, 250]} />
            <meshBasicMaterial map={haloTex} transparent blending={THREE.AdditiveBlending} depthWrite={false} fog={false} opacity={0.55} />
          </mesh>
          <mesh renderOrder={-8}>
            <planeGeometry args={[64, 64]} />
            <meshBasicMaterial map={tx.moon_blood} transparent depthWrite={false} fog={false} color={new THREE.Color(1.25, 1.1, 1.1)} />
          </mesh>
        </group>
      </group>

      <Backdrop tex={tx.carnival_skyline_silhouette} radius={430} repeat={8} bottom={-46} center={center} haze={new THREE.Color('#3a1c26')} hazeAmt={0.55} />
      <Backdrop tex={tx.treeline_silhouette} radius={335} repeat={9} bottom={-34} center={center} brightness={0.9} haze={new THREE.Color('#1e1020')} hazeAmt={0.35} />

      <mesh rotation-x={-Math.PI / 2} position={[0, 0, -130]}>
        <planeGeometry args={[1500, 1500]} />
        {ride.quality === 'high' ? (
          <MeshReflectorMaterial
            map={groundTex}
            color="#9a8878"
            roughness={0.75}
            metalness={0.1}
            resolution={512}
            blur={[300, 90]}
            mixBlur={0.8}
            mixStrength={6}
            mixContrast={1.35}
            mirror={0}
            depthScale={1.1}
            minDepthThreshold={0.35}
            maxDepthThreshold={1.3}
          />
        ) : (
          <meshStandardMaterial map={groundTex} color="#9a8878" roughness={0.96} />
        )}
      </mesh>

      <hemisphereLight ref={hemi} args={[0x5b4a8c, 0x1c0f0a, 1.1]} />
      <directionalLight ref={moonLight} args={[0xa8a4ff, 0.9]} position={[-60, 120, 40]} />

      <mesh geometry={smoke.geo} material={smoke.mat} frustumCulled={false} renderOrder={8} />
    </>
  );
}
