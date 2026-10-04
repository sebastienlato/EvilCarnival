import * as THREE from 'three';
import { radialGlowTexture } from '../lib/utils';

/* One set of uniforms drives every light in the carnival. Updated once per frame by the rig. */
export const U = {
  uTime: { value: 0 },
  /** bulbs: grid power × house lights */
  uPower: { value: 1 },
  /** painted cut-outs: ambient light level */
  uLight: { value: 1 },
  uLightning: { value: 0 },
  uBeat: { value: 0 },
  uChase: { value: 0 },
  uFlashPos: { value: new THREE.Vector3() },
  uFlashDir: { value: new THREE.Vector3(0, 0, -1) },
  uFlashCos: { value: Math.cos(0.3) },
  uFlashOn: { value: 0 },
};

const fog = () => THREE.UniformsUtils.clone(THREE.UniformsLib.fog);

/* ───────── Painted cut-outs ───────── */
export interface CutoutOpts {
  tint?: THREE.ColorRepresentation | THREE.Color;
  alphaTest?: number;
  transparent?: boolean;
  floor?: number;
  side?: THREE.Side;
  fog?: boolean;
}
export function cutoutMaterial(map: THREE.Texture, { tint = 0xffffff, alphaTest = 0.5, transparent = false, floor = 0.14, side = THREE.DoubleSide, fog: useFog = true }: CutoutOpts = {}) {
  return new THREE.ShaderMaterial({
    uniforms: {
      ...fog(),
      map: { value: map },
      uTint: { value: tint instanceof THREE.Color ? tint : new THREE.Color(tint) },
      uAlphaTest: { value: alphaTest },
      uOpacity: { value: 1 },
      uFloor: { value: floor },
      uLight: U.uLight,
      uLightning: U.uLightning,
      uFlashPos: U.uFlashPos,
      uFlashDir: U.uFlashDir,
      uFlashCos: U.uFlashCos,
      uFlashOn: U.uFlashOn,
    },
    vertexShader: /* glsl */`
      varying vec2 vUv; varying vec3 vWorld;
      #include <fog_pars_vertex>
      void main() {
        vUv = uv;
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorld = wp.xyz;
        vec4 mvPosition = viewMatrix * wp;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }
    `,
    fragmentShader: /* glsl */`
      uniform sampler2D map;
      uniform vec3 uTint, uFlashPos, uFlashDir;
      uniform float uAlphaTest, uOpacity, uFloor, uLight, uLightning, uFlashCos, uFlashOn;
      varying vec2 vUv; varying vec3 vWorld;
      #include <fog_pars_fragment>
      void main() {
        vec4 t = texture2D(map, vUv);
        if (t.a < uAlphaTest) discard;
        float level = mix(uFloor, 1.0, uLight);
        vec3 L = vWorld - uFlashPos;
        float d = length(L);
        float cone = smoothstep(uFlashCos, uFlashCos + 0.035, dot(L / max(d, 1e-3), uFlashDir));
        level += cone * uFlashOn * 1.7 / (1.0 + d * d * 0.0035);
        vec3 c = t.rgb * uTint * level + t.rgb * vec3(0.55, 0.68, 1.0) * uLightning * 0.9;
        gl_FragColor = vec4(c, t.a * uOpacity);
        #include <fog_fragment>
      }
    `,
    side,
    transparent,
    depthWrite: !transparent,
    fog: useFog,
  });
}

/**
 * Painted cut-out with fake thickness: N alpha-tested copies stacked along -Z,
 * back layers darkened. Reads as a carved slab when the camera moves around it.
 */
export function stackedCutout(map: THREE.Texture, width: number, height: number, { layers = 6, depth = 0.35, tint = 0xffffff as THREE.ColorRepresentation | THREE.Color, edge = 0x1a0c08 as THREE.ColorRepresentation, floor = 0.14 } = {}) {
  const group = new THREE.Group();
  const geo = new THREE.PlaneGeometry(width, height);
  const front = cutoutMaterial(map, { tint, floor });
  const edgeMat = cutoutMaterial(map, { tint: edge, floor: 0.5 });
  for (let i = layers - 1; i >= 0; i--) {
    const m = new THREE.Mesh(geo, i === 0 ? front : edgeMat);
    m.position.z = -(i / Math.max(layers - 1, 1)) * depth;
    group.add(m);
  }
  return group;
}

/* ───────── Glow sprites (camera-facing, additive) ───────── */
let glowTex: THREE.Texture | null = null;
const getGlowTex = () => (glowTex ??= radialGlowTexture('rgba(255,236,200,1)', 'rgba(255,150,70,0.45)', 128));

export interface GlowItem { p: THREE.Vector3; s: number; seed?: number; color?: THREE.Color }
export function createGlows(items: GlowItem[], { color = new THREE.Color(1, 0.6, 0.3), intensity = 2.2, flicker = 0.25 } = {}) {
  const base = new THREE.PlaneGeometry(1, 1);
  const geo = new THREE.InstancedBufferGeometry();
  geo.index = base.index;
  geo.setAttribute('position', base.attributes.position);
  geo.setAttribute('uv', base.attributes.uv);
  const n = items.length;
  const aPos = new Float32Array(n * 3), aSize = new Float32Array(n), aSeed = new Float32Array(n), aCol = new Float32Array(n * 3);
  items.forEach((it, i) => {
    aPos.set([it.p.x, it.p.y, it.p.z], i * 3);
    aSize[i] = it.s;
    aSeed[i] = it.seed ?? Math.random();
    const c = it.color ?? color;
    aCol.set([c.r, c.g, c.b], i * 3);
  });
  geo.setAttribute('aPos', new THREE.InstancedBufferAttribute(aPos, 3));
  geo.setAttribute('aSize', new THREE.InstancedBufferAttribute(aSize, 1));
  geo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(aSeed, 1));
  geo.setAttribute('aCol', new THREE.InstancedBufferAttribute(aCol, 3));
  geo.instanceCount = n;
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      map: { value: getGlowTex() },
      uTime: U.uTime, uPower: U.uPower, uBeat: U.uBeat,
      uIntensity: { value: intensity },
      uFlicker: { value: flicker },
      uLocal: { value: 1 },
    },
    vertexShader: /* glsl */`
      attribute vec3 aPos; attribute float aSize; attribute float aSeed; attribute vec3 aCol;
      uniform float uTime, uPower, uFlicker, uLocal, uIntensity, uBeat;
      varying vec2 vUv; varying vec3 vCol; varying float vI;
      void main() {
        vUv = uv;
        vec4 mv = modelViewMatrix * vec4(aPos, 1.0);
        float f = 0.85 + 0.15 * sin(uTime * (2.0 + aSeed * 5.0) + aSeed * 40.0);
        float stutter = step(0.985, fract(sin(floor(uTime * 9.0 + aSeed * 71.0) * 12.9898) * 43758.5453));
        f *= 1.0 - stutter * uFlicker * 3.0;
        vI = max(f, 0.0) * uPower * uLocal * uIntensity * (0.92 + 0.18 * uBeat);
        vCol = aCol;
        mv.xy += position.xy * aSize;
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */`
      uniform sampler2D map;
      varying vec2 vUv; varying vec3 vCol; varying float vI;
      void main() {
        vec4 t = texture2D(map, vUv);
        gl_FragColor = vec4(vCol * t.rgb * t.a * vI, 1.0);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = 5;
  return mesh;
}

/* ───────── Incandescent bulbs (HDR spheres; bloom does the glowing) ───────── */
export function createBulbs(points: THREE.Vector3[], { radius = 0.09, color = new THREE.Color(1, 0.6, 0.26), intensity = 5, chase = 0, chaseSpeed = 1, phases = null as number[] | null } = {}) {
  const base = new THREE.SphereGeometry(radius, 8, 6);
  const geo = new THREE.InstancedBufferGeometry();
  geo.index = base.index;
  geo.setAttribute('position', base.attributes.position);
  geo.setAttribute('normal', base.attributes.normal);
  const n = points.length;
  const aPos = new Float32Array(n * 3), aSeed = new Float32Array(n), aPhase = new Float32Array(n);
  points.forEach((p, i) => {
    aPos.set([p.x, p.y, p.z], i * 3);
    aSeed[i] = Math.random();
    aPhase[i] = phases ? phases[i] : i;
  });
  geo.setAttribute('aPos', new THREE.InstancedBufferAttribute(aPos, 3));
  geo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(aSeed, 1));
  geo.setAttribute('aPhase', new THREE.InstancedBufferAttribute(aPhase, 1));
  geo.instanceCount = n;
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: U.uTime, uPower: U.uPower, uBeat: U.uBeat, uChaseClock: U.uChase,
      uColor: { value: color },
      uIntensity: { value: intensity },
      uChase: { value: chase },
      uChaseSpeed: { value: chaseSpeed },
      uLocal: { value: 1 },
    },
    vertexShader: /* glsl */`
      attribute vec3 aPos; attribute float aSeed; attribute float aPhase;
      uniform float uTime, uPower, uChase, uChaseSpeed, uLocal, uIntensity, uBeat, uChaseClock;
      varying float vI; varying vec3 vN;
      void main() {
        float f = 0.82 + 0.18 * sin(uTime * (1.5 + aSeed * 4.0) + aSeed * 30.0);
        float dead = step(0.965, aSeed);
        float stutter = step(0.992, fract(sin(floor(uTime * 12.0 + aSeed * 93.0) * 12.9898) * 43758.5453));
        float stepN = floor(uChaseClock * uChaseSpeed);                // steps on the calliope's beat
        float lit = step(mod(aPhase + stepN, 4.0), 1.5);
        float chase = mix(1.0, 0.18 + 0.82 * lit, uChase);
        vI = f * chase * (1.0 - stutter) * (1.0 - dead * 0.93) * uPower * uLocal * uIntensity * (0.9 + 0.3 * uBeat);
        vN = normalize(normalMatrix * normal);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(aPos + position, 1.0);
      }
    `,
    fragmentShader: /* glsl */`
      uniform vec3 uColor;
      varying float vI; varying vec3 vN;
      void main() {
        float rim = 0.55 + 0.45 * abs(vN.z);
        gl_FragColor = vec4(uColor * (0.06 + vI * rim), 1.0);
      }
    `,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  return mesh;
}

export function createWire(points: THREE.Vector3[], color = 0x0b0708) {
  return new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), new THREE.LineBasicMaterial({ color, fog: true }));
}

/** Standard materials also dim with the grid: every "electric" light registers here. */
export const electricLights: { light: THREE.Light; base: number }[] = [];
export function electric<L extends THREE.Light>(light: L, base = light.intensity) {
  electricLights.push({ light, base });
  return light;
}
