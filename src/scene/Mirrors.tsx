import * as THREE from 'three';
import { useEffect, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { Reflector } from 'three/examples/jsm/objects/Reflector.js';
import { CAMERA_KEYS, LAYOUT, T } from '../config';
import { bridge, ride, useUI } from '../state/ride';
import { useBulbs, useTextures, variant } from '../three/assets';
import { createGlows, electric, stackedCutout } from '../three/materials';
import { checkerTexture, damp, smoothstep } from '../lib/utils';

export const GHOST_LAYER = 1;

const FunhouseShader = {
  name: 'FunhouseMirror',
  uniforms: {
    color: { value: null as THREE.Color | null },
    tDiffuse: { value: null as THREE.Texture | null },
    textureMatrix: { value: null as THREE.Matrix4 | null },
    uTime: { value: 0 }, uMode: { value: 0 }, uWarp: { value: 1 },
    tCam: { value: null as THREE.Texture | null }, uCam: { value: 0 }, uCamAspect: { value: 1.333 },
    tGhost: { value: null as THREE.Texture | null }, uGhost: { value: 0 }, uAspect: { value: 0.6 },
  },
  vertexShader: /* glsl */`
    uniform mat4 textureMatrix;
    varying vec4 vUvProj; varying vec2 vUv;
    void main() {
      vUvProj = textureMatrix * vec4(position, 1.0);
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */`
    uniform vec3 color;
    uniform sampler2D tDiffuse, tCam, tGhost;
    uniform float uTime, uMode, uWarp, uCam, uCamAspect, uGhost, uAspect;
    varying vec4 vUvProj; varying vec2 vUv;
    float hash(vec2 p) { return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5453); }
    float noise(vec2 p) { vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
      return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y); }
    vec2 warp(vec2 p) {
      vec2 c = p - 0.5;
      if (uMode < 0.5) { c.x *= 1.0 + 0.55 * sin(p.y * 3.14159); c.y *= 0.8 + 0.1 * sin(uTime * 0.6); }
      else if (uMode < 1.5) { float r = length(c * vec2(1.0, 0.6)); c *= 0.62 + 0.9 * r; }
      else if (uMode < 2.5) { c.x += sin(p.y * 18.0 + uTime * 1.3) * 0.028; c.y += sin(p.x * 11.0 - uTime) * 0.012; }
      else { float r = length(c); float a = (0.9 + 0.4 * sin(uTime * 0.3)) * smoothstep(0.55, 0.0, r); c = mat2(cos(a), -sin(a), sin(a), cos(a)) * c; }
      return mix(p, c + 0.5, uWarp);
    }
    void main() {
      vec2 w = warp(vUv);
      vec2 off = w - vUv;
      vec3 col = texture2D(tDiffuse, vUvProj.xy / vUvProj.w + vec2(-off.x, off.y) * 0.9).rgb;
      if (uCam > 0.001) {
        vec2 cw = vec2(1.0 - w.x, w.y);
        vec2 cuv = vec2(0.5 + (cw.x - 0.5) * (uAspect / uCamAspect), cw.y);
        vec3 cam = texture2D(tCam, cuv).rgb;
        cam = mix(vec3(dot(cam, vec3(0.3, 0.59, 0.11))), cam, 0.55) * vec3(1.05, 0.86, 0.8);
        col = mix(col, cam * 0.9, uCam);
        vec2 g = (w - vec2(0.44, -0.02)) / vec2(0.62, 0.95);
        if (g.x > 0.0 && g.x < 1.0 && g.y > 0.0 && g.y < 1.0) {
          vec4 gh = texture2D(tGhost, g);
          col = mix(col, gh.rgb * vec3(0.55, 0.45, 0.5), gh.a * uGhost * uCam);
        }
      }
      float n = noise(vUv * vec2(9.0, 14.0)) * 0.6 + noise(vUv * 40.0) * 0.4;
      float edge = smoothstep(0.0, 0.14, min(min(vUv.x, 1.0 - vUv.x), min(vUv.y, 1.0 - vUv.y)));
      col *= mix(0.25, 1.0, edge * smoothstep(0.1, 0.55, n + edge * 0.5));
      gl_FragColor = vec4(col * vec3(0.92, 0.9, 1.02) * color + vec3(0.02, 0.012, 0.03), 1.0);
    }
  `,
};

type Surface = THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial> & { getRenderTarget?: () => THREE.WebGLRenderTarget; camera?: THREE.Camera };

export function Mirrors() {
  const tx = useTextures('mirror_frame_ornate', 'clown_silhouette_behind', 'tex_velvet_curtain');
  const bulbs = useBulbs();

  const built = useMemo(() => {
    const group = new THREE.Group();
    group.position.copy(LAYOUT.mirrors);
    const D = LAYOUT.mirrorsFacing;
    const faceAngle = Math.atan2(D.x, D.z);

    const floor = new THREE.Mesh(new THREE.CircleGeometry(12.5, 64), new THREE.MeshStandardMaterial({ map: checkerTexture(10), roughness: 0.3, metalness: 0.1 }));
    (floor.material.map as THREE.Texture).repeat.set(2.2, 2.2);
    floor.rotation.x = -Math.PI / 2; floor.position.y = 0.02;
    group.add(floor);
    const drapeGeo = new THREE.CylinderGeometry(12, 12, 9, 96, 12, true, faceAngle + 0.75, Math.PI * 2 - 1.5);
    const pos = drapeGeo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      const k = 1 + Math.sin(Math.atan2(x, z) * 60) * 0.018;
      pos.setX(i, x * k); pos.setZ(i, z * k);
    }
    drapeGeo.computeVertexNormals();
    const drapes = new THREE.Mesh(drapeGeo, new THREE.MeshStandardMaterial({ map: variant(tx.tex_velvet_curtain, 10, 2, THREE.MirroredRepeatWrapping), side: THREE.DoubleSide, roughness: 1, color: 0x9a6a6a }));
    drapes.position.y = 4.5;
    group.add(drapes);

    const FW = 3.9, FH = FW * 1.5;
    const hole = { cx: 0, cy: (0.5 - 784 / 1536) * FH, w: (564 / 1024) * FW, h: (952 / 1536) * FH };
    const modes = [2, 0, 1, 3, 2];
    const mirrors: { surface: Surface; reflective: boolean }[] = [];
    [-66, -33, 0, 33, 66].forEach((deg, i) => {
      const dir = D.clone().negate().applyAxisAngle(new THREE.Vector3(0, 1, 0), THREE.MathUtils.degToRad(deg));
      const holder = new THREE.Group();
      holder.position.copy(dir.multiplyScalar(8.6));
      holder.lookAt(0, 0, 0);
      group.add(holder);
      const frame = stackedCutout(tx.mirror_frame_ornate, FW, FH, { layers: 5, depth: 0.28, tint: new THREE.Color(1, 0.94, 0.88) });
      frame.position.y = FH / 2 + 0.1;
      holder.add(frame);
      holder.add(createGlows((bulbs.mirror_frame_ornate || []).map(([u, v, r]) => ({ p: new THREE.Vector3((u - 0.5) * FW, (0.5 - v) * FH + FH / 2 + 0.1, 0.05), s: Math.max(r * FW * 7, 0.4) })), { intensity: 1.3 }));
      const reflective = i >= 1 && i <= 3;
      const geo = new THREE.PlaneGeometry(hole.w + 0.12, hole.h + 0.12);
      let surface: Surface;
      if (reflective) {
        surface = new Reflector(geo, { textureWidth: 512, textureHeight: 768, clipBias: 0.003, color: new THREE.Color(1.05, 1.0, 1.1), shader: FunhouseShader, multisample: 0 }) as unknown as Surface;
        surface.camera?.layers.enable(GHOST_LAYER);
      } else {
        surface = new THREE.Mesh(geo, new THREE.ShaderMaterial({
          uniforms: THREE.UniformsUtils.clone(FunhouseShader.uniforms),
          vertexShader: FunhouseShader.vertexShader, fragmentShader: FunhouseShader.fragmentShader,
        })) as Surface;
        surface.material.uniforms.color.value = new THREE.Color(0.35, 0.3, 0.38);
        surface.material.uniforms.textureMatrix.value = new THREE.Matrix4();
      }
      surface.position.set(hole.cx, FH / 2 + 0.1 + hole.cy, -0.11);
      holder.add(surface);
      const u = surface.material.uniforms;
      u.uMode.value = modes[i];
      u.uAspect.value = hole.w / hole.h;
      u.tGhost.value = tx.clown_silhouette_behind;
      mirrors.push({ surface, reflective });
    });
    const centre = mirrors[2].surface;
    for (const m of mirrors) if (!m.reflective) m.surface.material.uniforms.tDiffuse.value = centre.getRenderTarget!().texture;

    // one reflection per mirror per frame: while one renders, every other mirror hides
    let reflecting = false;
    for (const m of mirrors) {
      if (!m.reflective) continue;
      const orig = m.surface.onBeforeRender;
      m.surface.onBeforeRender = function (...args: Parameters<THREE.Object3D['onBeforeRender']>) {
        if (reflecting) return;
        reflecting = true;
        for (const o of mirrors) if (o !== m) o.surface.visible = false;
        orig.apply(this, args);
        for (const o of mirrors) if (o !== m) o.surface.visible = true;
        reflecting = false;
      };
    }

    const lamp = electric(new THREE.PointLight(0xffb070, 55, 22, 1.5)); lamp.position.set(0, 7.5, 0);
    const violet = new THREE.PointLight(0x8a4aff, 30, 20, 1.6); violet.position.copy(D.clone().multiplyScalar(-6)).setY(2.5);
    group.add(lamp, violet);

    // The ghost: opaque (transparent objects skip the nested reflector pass) and on a
    // layer the main camera never renders. He fades in from pure black behind you.
    const GHOST_TINT = new THREE.Color(1.35, 1.15, 1.2);
    const ghostMat = new THREE.MeshBasicMaterial({ map: tx.clown_silhouette_behind, alphaTest: 0.5, color: new THREE.Color(0, 0, 0), fog: false });
    const ghost = new THREE.Mesh(new THREE.PlaneGeometry(4.1, 6.15), ghostMat);
    ghost.layers.set(GHOST_LAYER);
    const stand = (CAMERA_KEYS.find((k) => k[0] === 0.49)?.[1] ?? group.position).clone();
    ghost.position.copy(stand).addScaledVector(D, 1.6).add(new THREE.Vector3(D.z, 0, -D.x).multiplyScalar(0.7)).setY(2.46);
    ghost.scale.setScalar(0.8);
    ghost.lookAt(ghost.position.clone().sub(D));
    return { group, mirrors, ghost, ghostMat, GHOST_TINT };
  }, [tx, bulbs]);

  const s = useMemo(() => ({ ghost: 0, cam: 0, camOn: false, video: null as HTMLVideoElement | null, tex: null as THREE.VideoTexture | null }), []);
  const stopWebcam = useMemo(() => () => {
    (s.video?.srcObject as MediaStream | null)?.getTracks().forEach((tr) => tr.stop());
    for (const m of built.mirrors) m.surface.material.uniforms.tCam.value = null;
    s.tex?.dispose();
    s.video = null; s.tex = null; s.camOn = false;
  }, [built, s]);

  useEffect(() => {
    bridge.enableWebcam = async () => {
      if (s.camOn) return true;
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
        const video = document.createElement('video');
        video.srcObject = stream; video.muted = true; video.playsInline = true;
        await video.play();
        const tex = new THREE.VideoTexture(video);
        tex.colorSpace = THREE.SRGBColorSpace;
        for (const m of built.mirrors) {
          m.surface.material.uniforms.tCam.value = tex;
          m.surface.material.uniforms.uCamAspect.value = (video.videoWidth || 16) / (video.videoHeight || 9);
        }
        s.video = video; s.tex = tex; s.camOn = true;
        return true;
      } catch { return false; }
    };
    return stopWebcam;
  }, [built, s, stopWebcam]);

  useFrame(() => {
    const t = ride.t, dt = ride.dt;
    const near = t > 0.33 && t < 0.57;
    built.group.visible = near || t > T.panorama;
    for (const m of built.mirrors) m.surface.visible = near;
    const g = smoothstep(T.mirrorsGhost[0], T.mirrorsGhost[0] + 0.03, t) * (1 - smoothstep(T.mirrorsGhost[1] - 0.004, T.mirrorsGhost[1], t));
    s.ghost = damp(s.ghost, g, 3, dt);
    built.ghost.visible = near && s.ghost > 0.01;
    built.ghostMat.color.copy(built.GHOST_TINT).multiplyScalar(s.ghost * s.ghost);
    s.cam = damp(s.cam, s.camOn && near ? 1 : 0, 2, dt);
    if (s.camOn && !near && s.cam < 0.01) {
      stopWebcam();
      useUI.getState().set({ webcam: 'off' }); // so the mirror can be woken again on the way back
    }
    for (const m of built.mirrors) {
      const u = m.surface.material.uniforms;
      u.uTime.value = ride.time;
      u.uCam.value = s.cam;
      u.uGhost.value = s.ghost;
      u.uWarp.value = 1 - s.ghost * 0.88;
    }
  });

  return (
    <>
      <primitive object={built.group} />
      <primitive object={built.ghost} />
    </>
  );
}
