import * as THREE from 'three';
import { useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { T } from '../config';
import { ride } from '../state/ride';
import { audio } from '../lib/audio';
import { useTextures } from '../three/assets';
import { rand, samplePoints } from '../lib/utils';

type Shape = 'sphere' | 'ring' | 'willow' | 'grin' | 'text' | 'heart';
const COLORS = [new THREE.Color(1, 0.12, 0.16), new THREE.Color(1, 0.68, 0.2), new THREE.Color(1, 0.95, 0.86), new THREE.Color(0.65, 0.25, 1)];

interface Rocket { p: THREE.Vector3; v: THREE.Vector3; fuse: number; shape: Shape; color: THREE.Color }

/**
 * A GPU point cloud simulated on the CPU (a few thousand points is cheap):
 * rockets leave spark trails, then burst into spheres, rings, willows, or
 * shapes rasterised from art and type: a grinning face, the carnival's name.
 */
export function Fireworks() {
  const tx = useTextures('balloon_face');
  const size = useThree((s) => s.size);
  const gl = useThree((s) => s.gl);
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const N = ride.quality === 'high' ? 9000 : 3500;

  const sys = useMemo(() => {
    const pos = new Float32Array(N * 3), col = new Float32Array(N * 3), vel = new Float32Array(N * 3);
    const life = new Float32Array(N), maxLife = new Float32Array(N), sz = new Float32Array(N), drag = new Float32Array(N), grav = new Float32Array(N);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aColor', new THREE.BufferAttribute(col, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aLife', new THREE.BufferAttribute(new Float32Array(N), 1).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aSize', new THREE.BufferAttribute(sz, 1).setUsage(THREE.DynamicDrawUsage));
    const mat = new THREE.ShaderMaterial({
      uniforms: { uScale: { value: 400 }, uTime: { value: 0 } },
      vertexShader: /* glsl */`
        attribute vec3 aColor; attribute float aLife; attribute float aSize;
        uniform float uScale, uTime;
        varying vec3 vColor; varying float vA;
        void main() {
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          float tw = 0.65 + 0.35 * sin(uTime * 40.0 + position.x * 13.0 + position.y * 7.0);
          vA = aLife * mix(1.0, tw, step(aLife, 0.45));   // crackle as they die
          vColor = aColor;
          gl_PointSize = aSize * uScale / max(-mv.z, 1.0) * (0.4 + 0.6 * aLife);
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: /* glsl */`
        varying vec3 vColor; varying float vA;
        void main() {
          float d = length(gl_PointCoord - 0.5);
          float a = smoothstep(0.5, 0.0, d);
          gl_FragColor = vec4(vColor * a * vA * 7.0, 1.0);
        }
      `,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    const points = new THREE.Points(geo, mat);
    points.frustumCulled = false;

    // shapes: normalised point sets
    const grin = (() => {
      const img = tx.balloon_face.image as HTMLImageElement;
      const pts = samplePoints((g, w, h) => g.drawImage(img, 0, 0, w, h), 256, 256, 3, (r, g, b, a) => a > 128 && Math.min(r, g, b) > 150);
      return pts.filter((p) => p.y > -0.2).map((p) => ({ x: p.x * 2.2, y: (p.y - 0.12) * 2.2 }));  // drop the string
    })();
    const text = samplePoints((g, w, h) => {
      g.fillStyle = '#fff'; g.font = `400 ${h * 0.8}px Rye, Georgia, serif`;
      g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('HOLLOWGRIN', w / 2, h * 0.55);
    }, 900, 140, 4).map((p) => ({ x: p.x * 2, y: p.y * 2 }));
    const heart = Array.from({ length: 260 }, (_, i) => {
      const a = (i / 260) * Math.PI * 2;
      return { x: (16 * Math.pow(Math.sin(a), 3)) / 17, y: (13 * Math.cos(a) - 5 * Math.cos(2 * a) - 2 * Math.cos(3 * a) - Math.cos(4 * a)) / 17 };
    });

    return { points, mat, pos, col, vel, life, maxLife, sz, drag, grav, geo, shapes: { grin, text, heart } };
  }, [N, tx]);

  const s = useMemo(() => ({
    cursor: 0, rockets: [] as Rocket[], next: 0, count: 0, lastText: -100, live: false,
    light: new THREE.PointLight(0xffffff, 0, 260, 1.2), lightLevel: 0,
    right: new THREE.Vector3(), up: new THREE.Vector3(), fwd: new THREE.Vector3(), tmp: new THREE.Vector3(), spark: new THREE.Vector3(),
  }), []);

  const emit = (p: THREE.Vector3, v: THREE.Vector3, c: THREE.Color, lifeS: number, size: number, drag: number, grav: number) => {
    const i = s.cursor; s.cursor = (s.cursor + 1) % N;
    sys.pos.set([p.x, p.y, p.z], i * 3);
    sys.vel.set([v.x, v.y, v.z], i * 3);
    sys.col.set([c.r, c.g, c.b], i * 3);
    sys.life[i] = lifeS; sys.maxLife[i] = lifeS; sys.sz[i] = size; sys.drag[i] = drag; sys.grav[i] = grav;
    s.live = true;
  };

  const burst = (r: Rocket) => {
    const { right, up, fwd, tmp } = s;
    camera.getWorldDirection(fwd);
    right.crossVectors(fwd, camera.up).normalize();
    up.crossVectors(right, fwd).normalize();
    const alt = COLORS[(Math.random() * COLORS.length) | 0];
    const mk = (x: number, y: number, z: number, speed: number, c: THREE.Color, lifeS = rand(2, 3), sizeW = 0.9, drag = 1.6, grav = 3) => {
      tmp.set(0, 0, 0).addScaledVector(right, x).addScaledVector(up, y).addScaledVector(fwd, z).multiplyScalar(speed);
      emit(r.p, tmp, c, lifeS, sizeW, drag, grav);
    };
    const pts = r.shape === 'grin' ? sys.shapes.grin : r.shape === 'text' ? sys.shapes.text : r.shape === 'heart' ? sys.shapes.heart : null;
    if (pts) {
      const scale = r.shape === 'text' ? 120 : 78;   // drag ≈ 2.6 → final size ≈ scale / 2.6
      for (const p of pts) mk(p.x, p.y, rand(-0.01, 0.01), scale, Math.random() < 0.1 ? alt : r.color, rand(2.8, 3.6), r.shape === 'text' ? 0.55 : 0.75, 2.6, 0.8);
      for (let i = 0; i < 120; i++) { const a = rand(0, 6.28), b = Math.acos(rand(-1, 1)); mk(Math.sin(b) * Math.cos(a), Math.cos(b), Math.sin(b) * Math.sin(a), rand(4, 9), alt, rand(1, 1.8), 0.6); }
    } else if (r.shape === 'ring') {
      for (let i = 0; i < 360; i++) { const a = (i / 360) * Math.PI * 2; mk(Math.cos(a), Math.sin(a) * 0.35, Math.sin(a), 30, i % 3 ? r.color : alt); }
    } else {
      const willow = r.shape === 'willow';
      const n = willow ? 520 : 700;
      for (let i = 0; i < n; i++) {
        const a = rand(0, Math.PI * 2), b = Math.acos(rand(-1, 1));
        mk(Math.sin(b) * Math.cos(a), Math.cos(b), Math.sin(b) * Math.sin(a), rand(willow ? 16 : 24, willow ? 22 : 32), i % 7 ? r.color : alt, willow ? rand(3.2, 4.2) : rand(1.8, 2.6), willow ? 0.7 : 0.85, willow ? 1.2 : 1.7, willow ? 7 : 3);
      }
    }
    s.light.position.copy(r.p);
    s.light.color.copy(r.color);
    s.lightLevel = r.shape === 'text' ? 1.6 : 1;
    const d = camera.position.distanceTo(r.p);
    setTimeout(() => audio.firework(r.shape === 'text' ? 1.3 : 0.9), Math.min(d * 2.2, 500));
  };

  const launch = (shape?: Shape) => {
    const { fwd, right } = s;
    camera.getWorldDirection(fwd);
    fwd.y = 0; fwd.normalize();
    right.set(-fwd.z, 0, fwd.x);
    const dist = shape === 'text' ? 115 : rand(90, 150);
    const lateral = shape === 'text' ? 0 : rand(-55, 55);
    const base = camera.position.clone().addScaledVector(fwd, dist).addScaledVector(right, lateral).setY(0);
    const chosen: Shape = shape ?? (['sphere', 'sphere', 'ring', 'willow', 'grin', 'heart'] as Shape[])[(Math.random() * 6) | 0];
    const apex = chosen === 'text' ? 58 : rand(40, 66);
    const fuse = rand(1.3, 1.8);
    s.rockets.push({ p: base, v: new THREE.Vector3(rand(-2, 2), apex / fuse + 4, rand(-2, 2)), fuse, shape: chosen, color: COLORS[(Math.random() * COLORS.length) | 0] });
    audio.launch();
  };

  useFrame(() => {
    const t = ride.t, dt = ride.dt, time = ride.time;
    sys.mat.uniforms.uTime.value = time;
    sys.mat.uniforms.uScale.value = (size.height * gl.getPixelRatio() * 0.5) / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * 0.62;

    const show = ride.entered && t > T.fireworks;
    if (show && time > s.next) {
      s.count++;
      const grand = t > 0.975 && time - s.lastText > 11;
      if (grand) { s.lastText = time; launch('text'); } else launch();
      if (Math.random() < 0.3) launch();
      s.next = time + rand(0.7, 1.6);
    }
    // rockets
    for (let i = s.rockets.length - 1; i >= 0; i--) {
      const r = s.rockets[i];
      r.v.y -= 9 * dt;
      r.p.addScaledVector(r.v, dt);
      r.fuse -= dt;
      emit(r.p, s.spark.set(rand(-1, 1), rand(-3, -1), rand(-1, 1)), COLORS[1], rand(0.4, 0.8), 0.5, 2, 2);
      if (r.fuse <= 0) { burst(r); s.rockets.splice(i, 1); }
    }
    s.lightLevel = Math.max(0, s.lightLevel - dt * 1.4);
    s.light.intensity = s.lightLevel * s.lightLevel * 1600;

    // particles (nothing to simulate or upload between shows)
    if (!s.live) { sys.points.visible = false; return; }
    const lifeAttr = sys.geo.attributes.aLife as THREE.BufferAttribute;
    const lifeArr = lifeAttr.array as Float32Array;
    let any = false;
    for (let i = 0; i < N; i++) {
      if (sys.life[i] <= 0) { lifeArr[i] = 0; continue; }
      any = true;
      sys.life[i] -= dt;
      const k = Math.exp(-sys.drag[i] * dt);
      const j = i * 3;
      sys.vel[j] *= k; sys.vel[j + 1] = sys.vel[j + 1] * k - sys.grav[i] * dt; sys.vel[j + 2] *= k;
      sys.pos[j] += sys.vel[j] * dt; sys.pos[j + 1] += sys.vel[j + 1] * dt; sys.pos[j + 2] += sys.vel[j + 2] * dt;
      lifeArr[i] = Math.max(sys.life[i] / sys.maxLife[i], 0);
    }
    sys.geo.attributes.position.needsUpdate = true;
    sys.geo.attributes.aColor.needsUpdate = true;
    sys.geo.attributes.aSize.needsUpdate = true;
    lifeAttr.needsUpdate = true;
    s.live = any || s.rockets.length > 0;
    sys.points.visible = s.live;
  });

  return (
    <>
      <primitive object={sys.points} />
      <primitive object={s.light} />
    </>
  );
}

