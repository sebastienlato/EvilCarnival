import * as THREE from 'three';
import { useEffect, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import {
  BloomEffect, Effect, EffectAttribute, EffectComposer, EffectPass, RenderPass, ToneMappingEffect, ToneMappingMode,
} from 'postprocessing';
import { ride } from '../state/ride';
import { clamp } from '../lib/utils';

/* Grain, radial chromatic aberration (scales with ride speed), lens warp, glitch tears, blood pulse, grade. */
const GRADE = /* glsl */`
  uniform float uTime, uVel, uGrain, uCA, uGlitch, uRed, uDark, uLightning;
  float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }

  void mainImage(const in vec4 inputColor, const in vec2 uv0, out vec4 outputColor) {
    // lens warp (stronger at speed) + glitch tearing, done here because
    // UV-transforming effects can't share a pass with convolution effects
    vec2 c = uv0 - 0.5;
    float r2 = dot(c, c);
    vec2 uv = 0.5 + c * (1.0 - 0.03 * r2 - uVel * 0.08 * r2);
    if (uGlitch > 0.001) {
      float row = floor(uv.y * 48.0);
      float tick = floor(uTime * 24.0);
      float band = step(0.82, hash(vec2(row, tick)));
      uv.x += band * (hash(vec2(tick, row + 3.0)) - 0.5) * 0.12 * uGlitch;
    }
    float ca = (uCA + uVel * 0.009 + uGlitch * 0.012) * (0.4 + r2 * 3.5);
    vec2 dir = normalize(c + 1e-5);
    vec3 col = vec3(
      texture2D(inputBuffer, uv + dir * ca).r,
      texture2D(inputBuffer, uv).g,
      texture2D(inputBuffer, uv - dir * ca).b
    );
    // (linear space: sRGB encoding comes after this pass, so keep lifts tiny)
    float l = dot(col, vec3(0.299, 0.587, 0.114));
    col = mix(col * vec3(0.84, 0.74, 1.1) + vec3(0.0012, 0.0002, 0.0026), col, smoothstep(0.0, 0.18, l));
    col = mix(col, col * vec3(1.06, 0.98, 0.9), smoothstep(0.25, 0.8, l));
    col = mix(col, col * vec3(1.4, 0.35, 0.35), uRed);
    col = mix(col, col * vec3(0.8, 0.9, 1.25), uLightning * 0.5);
    float vig = smoothstep(0.98, 0.22, length(c * vec2(1.0, 0.9)) * (1.12 + uDark * 0.35));
    col *= mix(0.26, 1.0, vig);
    // film grain, mostly multiplicative so blacks stay black
    float g = hash(uv * vec2(1920.0, 1080.0) + fract(uTime * 7.13) * 91.7) - 0.5;
    float gr = uGrain + uDark * 0.05;
    col = col * (1.0 + g * gr * 2.4) + g * gr * 0.006;
    outputColor = vec4(col, inputColor.a);
  }
`;

class GradeEffect extends Effect {
  constructor() {
    super('GradeEffect', GRADE, {
      attributes: EffectAttribute.CONVOLUTION,
      uniforms: new Map<string, THREE.Uniform>([
        ['uTime', new THREE.Uniform(0)], ['uVel', new THREE.Uniform(0)], ['uGrain', new THREE.Uniform(0.07)],
        ['uCA', new THREE.Uniform(0.0025)], ['uGlitch', new THREE.Uniform(0)], ['uRed', new THREE.Uniform(0)],
        ['uDark', new THREE.Uniform(0)], ['uLightning', new THREE.Uniform(0)],
      ]),
    });
  }
}

export function PostFX() {
  const { gl, scene, camera, size } = useThree();
  const { composer, grade, bloom } = useMemo(() => {
    const composer = new EffectComposer(gl, { frameBufferType: THREE.HalfFloatType, multisampling: 0 });
    composer.addPass(new RenderPass(scene, camera));
    const bloom = new BloomEffect({ mipmapBlur: true, luminanceThreshold: 0.85, luminanceSmoothing: 0.2, intensity: 1.35, radius: 0.72 });
    const tone = new ToneMappingEffect({ mode: ToneMappingMode.ACES_FILMIC });
    composer.addPass(new EffectPass(camera, bloom, tone));
    const grade = new GradeEffect();
    composer.addPass(new EffectPass(camera, grade));
    return { composer, grade, bloom };
  }, [gl, scene, camera]);

  useEffect(() => { composer.setSize(size.width, size.height); }, [composer, size]);
  useEffect(() => () => composer.dispose(), [composer]);

  useFrame((_, dt) => {
    const u = grade.uniforms;
    u.get('uTime')!.value = ride.time;
    u.get('uVel')!.value = ride.reducedMotion ? 0 : clamp(Math.abs(ride.vel) * 22);
    u.get('uCA')!.value = ride.reducedMotion ? 0 : 0.0025;
    u.get('uGrain')!.value = ride.reducedMotion ? 0.035 : 0.07;
    u.get('uGlitch')!.value = ride.glitch;
    u.get('uRed')!.value = ride.red * 0.6;
    u.get('uDark')!.value = ride.darkness;
    u.get('uLightning')!.value = ride.lightning;
    bloom.intensity = 1.35 + ride.lightning * 0.8;
    composer.render(dt);
  }, 1);

  return null;
}
