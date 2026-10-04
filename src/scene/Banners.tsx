import * as THREE from 'three';
import { useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { LAYOUT, T } from '../config';
import { ride } from '../state/ride';
import { useTextures } from '../three/assets';
import { U, createBulbs, electric } from '../three/materials';

/* Painted canvas banners rippling in the wind; they also catch lightning and the flashlight. */
function bannerMaterial(tex: THREE.Texture, seed: number) {
  return new THREE.ShaderMaterial({
    uniforms: {
      ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog),
      map: { value: tex }, uSeed: { value: seed },
      uTime: U.uTime, uLight: U.uLight, uLightning: U.uLightning,
    },
    vertexShader: /* glsl */`
      uniform float uTime, uSeed;
      varying vec2 vUv; varying float vShade;
      #include <fog_pars_vertex>
      void main() {
        vUv = uv;
        vec3 p = position;
        float hang = 1.0 - uv.y;
        float w = sin(p.x * 1.3 + uTime * 1.6 + uSeed) * 0.16 + sin(p.y * 2.1 + uTime * 2.3 + uSeed * 2.0) * 0.07;
        p.z += w * (0.3 + hang);
        vShade = 0.82 + w * 1.6;
        vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }
    `,
    fragmentShader: /* glsl */`
      uniform sampler2D map; uniform float uLight, uLightning;
      varying vec2 vUv; varying float vShade;
      #include <fog_pars_fragment>
      void main() {
        vec3 c = texture2D(map, vUv).rgb;
        float top = mix(0.55, 1.08, smoothstep(0.0, 1.0, vUv.y));
        c = c * vShade * top * mix(0.35, 1.0, uLight) + c * vec3(0.6, 0.7, 1.0) * uLightning;
        gl_FragColor = vec4(c, 1.0);
        #include <fog_fragment>
      }
    `,
    side: THREE.DoubleSide,
    fog: true,
  });
}

export function Banners() {
  const tx = useTextures('poster_belladonna', 'poster_gemini', 'poster_marrow');
  const group = useMemo(() => {
    const group = new THREE.Group();
    const texs = [tx.poster_belladonna, tx.poster_gemini, tx.poster_marrow];
    const W = 4.3, H = W * 1.5;
    const wood = new THREE.MeshStandardMaterial({ color: 0x2c1810, roughness: 0.9 });
    const gold = new THREE.MeshStandardMaterial({ color: 0xa67c2e, metalness: 0.8, roughness: 0.4 });
    LAYOUT.banners.forEach((pos, i) => {
      const b = new THREE.Group();
      b.position.copy(pos);
      b.lookAt(-3, 0, pos.z + (i - 1) * -2);
      group.add(b);
      const cloth = new THREE.Mesh(new THREE.PlaneGeometry(W, H, 24, 24), bannerMaterial(texs[i], i * 2.1));
      cloth.position.y = 1.4 + H / 2;
      cloth.frustumCulled = false;
      b.add(cloth);
      for (const s of [-1, 1]) {
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, 9.6, 8), wood);
        pole.position.set(s * (W / 2 + 0.2), 4.8, -0.05);
        b.add(pole);
      }
      const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, W + 0.6, 8), gold);
      rod.rotation.z = Math.PI / 2;
      rod.position.set(0, 1.4 + H + 0.05, 0.02);
      b.add(rod);
      const pts: THREE.Vector3[] = [];
      for (let k = 0; k < 11; k++) pts.push(new THREE.Vector3(-W / 2 + (k / 10) * W, 1.4 + H + 0.5 + Math.sin((k / 10) * Math.PI) * 0.6, 0.1));
      b.add(createBulbs(pts, { radius: 0.08, intensity: 6.5, chase: 1, chaseSpeed: 1 }));
    });
    const light = electric(new THREE.PointLight(0xffa060, 70, 26, 1.6));
    light.position.set(2, 9, -155);
    group.add(light);
    return group;
  }, [tx]);

  useFrame(() => { group.visible = (ride.t > 0.54 && ride.t < 0.8) || ride.t > T.panorama; });
  return <primitive object={group} />;
}
