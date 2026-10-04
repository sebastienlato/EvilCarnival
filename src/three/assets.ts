import * as THREE from 'three';
import { useMemo } from 'react';
import { useLoader, useThree } from '@react-three/fiber';

type Wrap = 'repeat' | 'repeatX' | 'mirror' | undefined;
const CONFIG: Record<string, { wrap?: Wrap; srgb?: boolean }> = {
  sky_night_panorama: { wrap: 'repeat' },
  treeline_silhouette: { wrap: 'repeatX' },
  carnival_skyline_silhouette: { wrap: 'repeatX' },
  tex_tent_stripes: { wrap: 'repeat' },
  tex_carousel_canopy: { wrap: 'repeat' },
  tex_ground_sawdust: { wrap: 'mirror' },
  tex_rusted_metal: { wrap: 'mirror' },
  tex_velvet_curtain: { wrap: 'mirror' },
  smoke_puff: { srgb: false },
};

export const TEXTURE_NAMES = [
  'ticket_front', 'ticket_back', 'sky_night_panorama', 'moon_blood', 'treeline_silhouette', 'carnival_skyline_silhouette',
  'gate_clown_face', 'clown_eyeball', 'logo_hollowgrin_lit', 'logo_hollowgrin_unlit', 'tex_tent_stripes', 'tex_carousel_canopy',
  'carousel_horse_skeleton', 'carousel_goat', 'carousel_serpent', 'tex_ground_sawdust', 'tex_rusted_metal', 'mirror_frame_ornate',
  'clown_silhouette_behind', 'fortune_machine', 'card_back', 'card_the_jester', 'card_the_ringmaster', 'card_the_red_balloon',
  'card_the_wheel', 'ringmaster_hero', 'poster_belladonna', 'poster_gemini', 'poster_marrow', 'balloon_face', 'debris_atlas',
  'smoke_puff', 'tex_velvet_curtain',
] as const;
export type TexName = (typeof TEXTURE_NAMES)[number];

export const url = (n: string) => `${import.meta.env.BASE_URL}assets/${n}.webp`;

function configure(tex: THREE.Texture, name: string, aniso: number) {
  if (tex.userData.configured) return tex;
  const c = CONFIG[name] ?? {};
  tex.colorSpace = c.srgb === false ? THREE.NoColorSpace : THREE.SRGBColorSpace;
  tex.anisotropy = aniso;
  if (c.wrap === 'repeat') tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  if (c.wrap === 'repeatX') tex.wrapS = THREE.RepeatWrapping;
  if (c.wrap === 'mirror') tex.wrapS = tex.wrapT = THREE.MirroredRepeatWrapping;
  tex.userData.configured = true;
  tex.needsUpdate = true;
  return tex;
}

/**
 * Suspends until the textures are loaded; returns them keyed by name. The record
 * keeps its identity across re-renders (useLoader's cached array does too), because
 * set pieces build their whole world in useMemo([tx]): a fresh object each render
 * would rebuild, and leak, everything whenever anything above re-rendered.
 */
export function useTextures<K extends TexName>(...names: K[]): Record<K, THREE.Texture> {
  const gl = useThree((s) => s.gl);
  const list = useLoader(THREE.TextureLoader, names.map(url));
  return useMemo(() => {
    const aniso = Math.min(8, gl.capabilities.getMaxAnisotropy());
    const out = {} as Record<K, THREE.Texture>;
    names.forEach((n, i) => { out[n] = configure(list[i], n, aniso); });
    return out;
  }, [list, gl]); // eslint-disable-line react-hooks/exhaustive-deps -- names are list's keys
}

/** A repeat-tuned clone (clones share the GPU image). */
const variants = new Map<string, THREE.Texture>();
export function variant(tex: THREE.Texture, rx: number, ry: number, wrap: THREE.Wrapping = THREE.RepeatWrapping, offset?: [number, number]) {
  const key = `${tex.uuid}:${rx}:${ry}:${wrap}:${offset ?? ''}`;
  let v = variants.get(key);
  if (!v) {
    v = tex.clone();
    v.wrapS = v.wrapT = wrap;
    v.repeat.set(rx, ry);
    if (offset) v.offset.set(offset[0], offset[1]);
    v.needsUpdate = true;
    variants.set(key, v);
  }
  return v;
}

export type Bulbs = Record<string, [number, number, number][]>;
let bulbsCache: Bulbs | null = null;
let bulbsPromise: Promise<Bulbs> | null = null;
/** Suspense-friendly JSON of painted bulb positions (u, v, radius). */
export function useBulbs(): Bulbs {
  if (bulbsCache) return bulbsCache;
  bulbsPromise ??= fetch(`${import.meta.env.BASE_URL}assets/bulbs.json`).then((r) => r.json()).then((j) => (bulbsCache = j));
  throw bulbsPromise;
}
