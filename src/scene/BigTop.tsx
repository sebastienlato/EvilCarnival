import * as THREE from 'three';
import { useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { LAYOUT, T } from '../config';
import { ride } from '../state/ride';
import { audio } from '../lib/audio';
import { useTextures, variant } from '../three/assets';
import { U, createBulbs, createGlows, createWire, electric } from '../three/materials';
import { damp, radialGlowTexture, sagPoints, smoothstep } from '../lib/utils';

const NOISE = /* glsl */`
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) { vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y); }
  float fbm(vec2 p) { float v = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { v += a * noise(p); p *= 2.03; a *= 0.5; } return v; }
`;
const fogU = () => THREE.UniformsUtils.clone(THREE.UniformsLib.fog);

function curtainMaterial(tex: THREE.Texture, side: number, width = 7.8) {
  return new THREE.ShaderMaterial({
    uniforms: { ...fogU(), map: { value: tex }, uOpen: { value: 0 }, uSide: { value: side }, uW: { value: width }, uTime: U.uTime, uSpot: { value: 0.3 }, uLight: U.uLight, uFlashPos: U.uFlashPos, uFlashDir: U.uFlashDir, uFlashCos: U.uFlashCos, uFlashOn: U.uFlashOn },
    vertexShader: /* glsl */`
      uniform float uOpen, uSide, uW, uTime;
      varying vec2 vUv; varying vec3 vN; varying vec3 vView; varying float vFold; varying vec3 vWorld;
      #include <fog_pars_vertex>
      void main() {
        vUv = uv;
        vec3 p = position;
        float edge = uSide * uW * 0.5;
        float squeeze = 1.0 - uOpen * 0.84 * (0.65 + 0.35 * (1.0 - uv.y));
        float d = p.x - edge;
        p.x = edge + d * squeeze;
        float freq = 6.2831 * 7.0 / uW;
        float amp = 0.22 * (1.0 + uOpen * 2.2);
        float ph = d * freq + sin(uTime * 0.7 + uv.y * 3.0) * 0.25;
        p.z += sin(ph) * amp + sin(uTime * 1.1 + uv.y * 4.0 + d) * 0.05 * (1.0 - uv.y);
        vFold = sin(ph);
        vN = normalize(normalMatrix * normalize(vec3(-cos(ph) * amp * freq * squeeze, 0.0, 1.0)));
        vec4 wp = modelMatrix * vec4(p, 1.0);
        vWorld = wp.xyz;
        vec4 mvPosition = viewMatrix * wp;
        vView = normalize(-mvPosition.xyz);
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }
    `,
    fragmentShader: /* glsl */`
      uniform sampler2D map; uniform float uSpot, uLight, uFlashCos, uFlashOn; uniform vec3 uFlashPos, uFlashDir;
      varying vec2 vUv; varying vec3 vN; varying vec3 vView; varying float vFold; varying vec3 vWorld;
      #include <fog_pars_fragment>
      void main() {
        vec3 base = texture2D(map, vUv * vec2(2.0, 2.5)).rgb * vec3(1.15, 0.95, 0.95);
        float diff = 0.25 + 0.75 * max(dot(vN, normalize(vec3(0.0, 0.6, 0.8))), 0.0);
        float sheen = pow(1.0 - max(dot(vN, vView), 0.0), 2.5);
        float spot = uSpot * smoothstep(0.9, 0.2, abs(vUv.x - 0.5) * 1.4) * (0.6 + 0.4 * vUv.y);
        vec3 c = base * diff * (0.8 * uLight + spot * 1.4) + vec3(0.7, 0.14, 0.16) * sheen * 0.8 * max(uLight, 0.15);
        c += base * vec3(1.0, 0.55, 0.25) * smoothstep(0.4, 0.0, vUv.y) * 0.9 * uLight;
        vec3 FL = vWorld - uFlashPos; float fd = length(FL);
        float torch = smoothstep(uFlashCos, uFlashCos + 0.035, dot(FL / fd, uFlashDir)) * uFlashOn * 2.2 / (1.0 + fd * fd * 0.004);
        c += base * torch * (0.5 + 0.5 * diff) + vec3(0.6, 0.15, 0.15) * sheen * torch;
        c *= 0.7 + 0.3 * vFold;
        float hem = smoothstep(0.045, 0.03, vUv.y);
        c = mix(c, vec3(0.75, 0.52, 0.16) * (0.6 * uLight + spot), hem);
        gl_FragColor = vec4(c, 1.0);
        #include <fog_fragment>
      }
    `,
    side: THREE.DoubleSide,
    fog: true,
  });
}

function ringmasterMaterial(tex: THREE.Texture) {
  return new THREE.ShaderMaterial({
    uniforms: { ...fogU(), map: { value: tex }, uBurn: { value: 0 }, uLight: { value: 0.1 }, uTime: U.uTime },
    vertexShader: /* glsl */`
      varying vec2 vUv;
      #include <fog_pars_vertex>
      void main() { vUv = uv; vec4 mvPosition = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }
    `,
    fragmentShader: /* glsl */`
      uniform sampler2D map; uniform float uBurn, uLight, uTime;
      varying vec2 vUv;
      #include <fog_pars_fragment>
      ${NOISE}
      void main() {
        vec4 t = texture2D(map, vUv);
        if (t.a < 0.4) discard;
        float n = fbm(vUv * vec2(5.0, 7.5) + vec2(0.0, uTime * 0.05));
        float front = uBurn * 1.25 - 0.1 + (1.0 - vUv.y) * 0.25 * uBurn;
        if (n < front) discard;
        float edge = smoothstep(front + 0.07, front, n) * step(0.001, uBurn);
        float pool = smoothstep(0.55, 0.0, length((vUv - vec2(0.5, 0.78)) * vec2(1.4, 0.9)));
        vec3 c = t.rgb * uLight * (0.55 + 0.9 * pool) + vec3(4.0, 1.4, 0.35) * edge;
        gl_FragColor = vec4(c, 1.0);
        #include <fog_fragment>
      }
    `,
    fog: true,
  });
}

/* Eyes in the dark bleachers. They blink, and shut when your flashlight finds them. */
function eyesMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: {
      map: { value: radialGlowTexture('rgba(255,240,170,1)', 'rgba(255,190,40,0.5)', 64) },
      uTime: U.uTime, uDark: { value: 0 },
      uFlashPos: U.uFlashPos, uFlashDir: U.uFlashDir, uFlashCos: U.uFlashCos,
    },
    vertexShader: /* glsl */`
      attribute vec3 aPos; attribute float aSeed;
      uniform float uTime, uDark, uFlashCos; uniform vec3 uFlashPos, uFlashDir;
      varying vec2 vUv; varying float vI;
      void main() {
        vUv = uv;
        vec4 wp = modelMatrix * vec4(aPos, 1.0);
        vec3 L = wp.xyz - uFlashPos;
        float lit = smoothstep(uFlashCos - 0.02, uFlashCos + 0.02, dot(normalize(L), uFlashDir));
        float blink = step(0.06, fract(uTime * (0.13 + aSeed * 0.2) + aSeed * 7.0));
        float wake = smoothstep(aSeed * 0.6, aSeed * 0.6 + 0.3, uDark);   // they open one pair at a time
        vI = blink * wake * (1.0 - lit) * 6.0;
        vec4 mv = viewMatrix * wp;
        mv.xy += position.xy * 0.42;
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */`
      uniform sampler2D map; varying vec2 vUv; varying float vI;
      void main() { vec4 t = texture2D(map, vUv); gl_FragColor = vec4(vec3(1.0, 0.75, 0.2) * t.rgb * t.a * vI, 1.0); }
    `,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
}

export function BigTop() {
  const tx = useTextures('tex_tent_stripes', 'tex_velvet_curtain', 'ringmaster_hero');
  const b = useMemo(() => {
    const B = LAYOUT.bigtop, R = LAYOUT.bigtopRadius;
    const group = new THREE.Group();
    group.position.copy(B);
    const stripe = (rx: number, ry: number) => variant(tx.tex_tent_stripes, rx, ry);
    const wallTex = stripe(14, 1);
    const wallMat = new THREE.MeshStandardMaterial({ map: wallTex, side: THREE.DoubleSide, roughness: 0.95, emissive: 0xffffff, emissiveMap: wallTex, emissiveIntensity: 0.06 });
    const WALL_H = 9, frontGap = 0.25, backGap = 0.44, len = Math.PI - backGap - frontGap;
    for (const start of [frontGap, Math.PI + backGap]) {
      const w = new THREE.Mesh(new THREE.CylinderGeometry(R, R, WALL_H, 96, 1, true, start, len), wallMat);
      w.position.y = WALL_H / 2;
      group.add(w);
    }
    const roofTex = stripe(8, 1);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(R + 0.8, 14, 96, 1, true), new THREE.MeshStandardMaterial({ map: roofTex, side: THREE.DoubleSide, roughness: 0.95, emissive: 0xffffff, emissiveMap: roofTex, emissiveIntensity: 0.05 }));
    roof.position.y = WALL_H + 7;
    const flag = new THREE.Mesh(new THREE.ConeGeometry(0.3, 2.4, 8), new THREE.MeshStandardMaterial({ color: 0x8b0a1a, emissive: 0x3a0008 }));
    flag.position.y = WALL_H + 15.2;
    group.add(roof, flag);

    const poleMat = new THREE.MeshStandardMaterial({ map: stripe(1, 10), roughness: 0.8 });
    const bulbPts: THREE.Vector3[] = [], ph: number[] = [];
    for (const px of [-6.5, 6.5]) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.34, 20, 16), poleMat);
      pole.position.set(px, 10, 0);
      group.add(pole);
      const top = new THREE.Vector3(px, 19.2, 0);
      for (let k = 0; k < 10; k++) {
        const a = (k / 10) * Math.PI * 2 + (px > 0 ? 0.3 : 0);
        const pts = sagPoints(top, new THREE.Vector3(Math.sin(a) * (R - 0.6), WALL_H - 0.2, Math.cos(a) * (R - 0.6)), 1.4, 26);
        group.add(createWire(pts));
        for (let j = 2; j < pts.length - 1; j += 2) { bulbPts.push(pts[j]); ph.push(j); }
      }
    }
    for (let i = 0; i < 120; i++) { const a = (i / 120) * Math.PI * 2; bulbPts.push(new THREE.Vector3(Math.sin(a) * (R - 0.15), WALL_H - 0.3, Math.cos(a) * (R - 0.15))); ph.push(i); }
    group.add(createBulbs(bulbPts, { radius: 0.1, intensity: 6, chase: 0.4, chaseSpeed: 0.5, phases: ph }));

    const curb = new THREE.Mesh(new THREE.CylinderGeometry(8.5, 8.5, 0.6, 96, 1, true), new THREE.MeshStandardMaterial({ map: stripe(18, 0.15), side: THREE.DoubleSide, roughness: 0.8 }));
    curb.position.y = 0.3;
    const sawdust = new THREE.Mesh(new THREE.CircleGeometry(8.5, 64), new THREE.MeshStandardMaterial({ color: 0x8a6a48, roughness: 1 }));
    sawdust.rotation.x = -Math.PI / 2; sawdust.position.y = 0.03;
    group.add(curb, sawdust);

    const benchMat = new THREE.MeshStandardMaterial({ color: 0x2a170f, roughness: 0.9, side: THREE.DoubleSide });
    const eyes: THREE.Vector3[] = [], eyeSeeds: number[] = [];
    // bleachers flank the stage (back half), so you face them as you walk in
    const ranges: [number, number][] = [[Math.PI - 1.6, 1.05], [Math.PI + 0.55, 1.05]];
    for (let r = 0; r < 4; r++) {
      const rad = R - 4.6 + r * 0.9, h = 0.55 + r * 0.55;
      for (const [start, l] of ranges) {
        const riser = new THREE.Mesh(new THREE.CylinderGeometry(rad, rad, h, 48, 1, true, start, l), benchMat);
        riser.position.y = h / 2;
        const seat = new THREE.Mesh(new THREE.RingGeometry(rad, rad + 0.9, 48, 1, start - Math.PI / 2, l), benchMat);
        seat.rotation.x = -Math.PI / 2; seat.position.y = h;
        group.add(riser, seat);
        // the audience you can't see
        for (let k = 0; k < 7; k++) {
          const a = start + (k + 0.5 + (Math.random() - 0.5) * 0.6) * (l / 7);
          const p = new THREE.Vector3(Math.sin(a) * (rad + 0.45), h + 1.35 + Math.random() * 0.2, Math.cos(a) * (rad + 0.45));
          const side = new THREE.Vector3(Math.cos(a), 0, -Math.sin(a)).multiplyScalar(0.16);
          const seed = Math.random();
          eyes.push(p.clone().add(side), p.clone().sub(side));
          eyeSeeds.push(seed, seed);
        }
      }
    }
    const eyeBase = new THREE.PlaneGeometry(1, 1);
    const eyeGeo = new THREE.InstancedBufferGeometry();
    eyeGeo.index = eyeBase.index;
    eyeGeo.setAttribute('position', eyeBase.attributes.position);
    eyeGeo.setAttribute('uv', eyeBase.attributes.uv);
    eyeGeo.setAttribute('aPos', new THREE.InstancedBufferAttribute(new Float32Array(eyes.flatMap((p) => [p.x, p.y, p.z])), 3));
    eyeGeo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(new Float32Array(eyeSeeds), 1));
    eyeGeo.instanceCount = eyes.length;
    const eyesMat = eyesMaterial();
    const audience = new THREE.Mesh(eyeGeo, eyesMat);
    audience.frustumCulled = false;
    audience.renderOrder = 6;
    group.add(audience);

    const stageZ = -R + 3.2;
    const stage = new THREE.Mesh(new THREE.BoxGeometry(16, 1.2, 5.5), new THREE.MeshStandardMaterial({ color: 0x2a140c, roughness: 0.8 }));
    stage.position.set(0, 0.6, stageZ - 1.2);
    group.add(stage);
    const foot: THREE.Vector3[] = [];
    for (let i = 0; i < 24; i++) foot.push(new THREE.Vector3(-7.6 + i * (15.2 / 23), 1.25, stageZ + 1.55));
    group.add(createBulbs(foot, { radius: 0.12, intensity: 7, color: new THREE.Color(1, 0.7, 0.4) }));

    const CW = 7.8, CH = 9.6, curtainZ = stageZ - 1.3;
    const velvet = tx.tex_velvet_curtain;
    const curtains = [-1, 1].map((side) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(CW, CH, 96, 24), curtainMaterial(velvet, side));
      m.position.set((side * CW) / 2, 1.2 + CH / 2, curtainZ);
      m.frustumCulled = false;
      group.add(m);
      return m;
    });
    const valance = new THREE.Mesh(new THREE.PlaneGeometry(16.5, 1.6, 64, 4), curtainMaterial(velvet, 0, 16.5));
    valance.position.set(0, 1.2 + CH - 0.2, curtainZ + 0.35);
    group.add(valance);

    const RMH = 7.6, RMW = RMH / 1.5;
    const rmMat = ringmasterMaterial(tx.ringmaster_hero);
    const ringmaster = new THREE.Mesh(new THREE.PlaneGeometry(RMW, RMH), rmMat);
    ringmaster.position.set(0, 1.2 + RMH / 2, curtainZ - 1.4);
    group.add(ringmaster);
    const rmEyes = createGlows([
      { p: new THREE.Vector3((451 / 1024 - 0.5) * RMW, (0.5 - 174 / 1536) * RMH, 0.03), s: 0.28, color: new THREE.Color(1, 0.78, 0.2) },
      { p: new THREE.Vector3((490 / 1024 - 0.5) * RMW, (0.5 - 158 / 1536) * RMH, 0.03), s: 0.28, color: new THREE.Color(1, 0.78, 0.2) },
    ], { intensity: 0, flicker: 0 });
    ringmaster.add(rmEyes);

    const spotPos = new THREE.Vector3(0, 19, stageZ + 4);
    const spotTarget = new THREE.Vector3(0, 1.2, curtainZ - 1.4);
    const spot = new THREE.SpotLight(0xffe0b0, 0, 40, 0.28, 0.55, 1.1);
    spot.position.copy(spotPos);
    spot.target.position.copy(spotTarget);
    group.add(spot, spot.target);
    const beamLen = spotPos.distanceTo(spotTarget);
    const beamGeo = new THREE.ConeGeometry(3.4, beamLen, 48, 1, true);
    beamGeo.translate(0, -beamLen / 2, 0);
    const beamMat = new THREE.ShaderMaterial({
      uniforms: { uI: { value: 0 }, uTime: U.uTime },
      vertexShader: /* glsl */`varying vec2 vUv; varying float vEdge;
        void main() { vUv = uv; vec3 n = normalize(normalMatrix * normal); vec4 mv = modelViewMatrix * vec4(position, 1.0); vEdge = abs(dot(n, normalize(-mv.xyz))); gl_Position = projectionMatrix * mv; }`,
      fragmentShader: /* glsl */`uniform float uI, uTime; varying vec2 vUv; varying float vEdge;
        void main() { float a = pow(vEdge, 2.2) * smoothstep(0.0, 0.25, vUv.y) * (0.5 + 0.5 * vUv.y) * (0.9 + 0.1 * sin(uTime * 23.0)); gl_FragColor = vec4(vec3(1.0, 0.86, 0.62) * a * uI, 1.0); }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    });
    const beam = new THREE.Mesh(beamGeo, beamMat);
    beam.position.copy(spotPos);
    group.add(beam);
    group.updateMatrixWorld(true);
    beam.lookAt(group.localToWorld(spotTarget.clone()));
    beam.rotateX(-Math.PI / 2);

    const motes = new Float32Array(260 * 3);
    for (let i = 0; i < 260; i++) {
      const k = Math.random();
      const p = new THREE.Vector3().lerpVectors(spotPos, spotTarget, k);
      const r = Math.sqrt(Math.random()) * 3.2 * k, a = Math.random() * Math.PI * 2;
      motes.set([p.x + Math.cos(a) * r, p.y + (Math.random() - 0.5) * 0.4, p.z + Math.sin(a) * r], i * 3);
    }
    const moteGeo = new THREE.BufferGeometry();
    moteGeo.setAttribute('position', new THREE.BufferAttribute(motes, 3));
    const moteMat = new THREE.PointsMaterial({ size: 0.06, color: new THREE.Color(2.2, 1.8, 1.3), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
    group.add(new THREE.Points(moteGeo, moteMat));
    const house = electric(new THREE.PointLight(0xff9250, 120, 44, 1.4));
    house.position.set(0, 14, 2);
    group.add(house);
    return { group, curtains, drapes: [...curtains, valance], rmMat, ringmaster, rmEyes, spot, beamMat, moteMat, eyesMat };
  }, [tx]);

  const s = useMemo(() => ({ spot: 0, burnPlayed: false }), []);
  useFrame(() => {
    const t = ride.t, dt = ride.dt, time = ride.time;
    b.group.visible = t > 0.5;
    if (t < 0.66 || t > 0.92) return;
    b.eyesMat.uniforms.uDark.value = ride.darkness;
    const open = smoothstep(T.curtainsOpen[0], T.curtainsOpen[1], t);
    for (const c of b.curtains) c.material.uniforms.uOpen.value = open;
    s.spot = damp(s.spot, smoothstep(T.curtainsOpen[0] + 0.005, T.curtainsOpen[1], t), 3, dt);
    const flick = s.spot * (0.93 + 0.07 * Math.sin(time * 31)) * ride.power;
    b.spot.intensity = 900 * flick;
    b.beamMat.uniforms.uI.value = 0.55 * flick;
    b.moteMat.opacity = 0.9 * flick;
    for (const c of b.drapes) c.material.uniforms.uSpot.value = 0.25 * (1 - ride.darkness) + flick * 0.9;
    b.rmMat.uniforms.uLight.value = 0.12 * (1 - ride.darkness) + flick * 1.25;
    const burn = smoothstep(T.ringmasterBurn[0], T.ringmasterBurn[1], t);
    b.rmMat.uniforms.uBurn.value = burn;
    b.ringmaster.visible = burn < 0.999;
    (b.rmEyes.material as THREE.ShaderMaterial).uniforms.uIntensity.value = (0.4 + flick * 3 + ride.darkness * 2.5) * (1 - burn);
    if (burn > 0.02 && !s.burnPlayed) { s.burnPlayed = true; audio.burn(); }
    if (burn < 0.01) s.burnPlayed = false;
  });

  return <primitive object={b.group} />;
}
